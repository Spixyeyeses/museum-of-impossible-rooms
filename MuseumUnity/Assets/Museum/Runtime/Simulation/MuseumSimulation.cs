using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Museum.Simulation
{
    /// <summary>
    /// Native port of the spatial rules in src/engine.mjs. Presentation must convert coordinates only
    /// at its boundary. Unity physics and preview-grid offsets never participate in this simulation.
    /// </summary>
    public sealed class MuseumSimulation
    {
        public const float EyeHeight = 1.6f;
        public const float PlayerRadius = .24f;
        public const int MaxRayPortals = 4;
        private const float Epsilon = .000001f;
        public MuseumWorld World { get; }
        public MuseumState State { get; }
        private struct Body { public Vector3 Center, Extents; }
        private struct Crossing { public MuseumPortal Portal; public float T; public Vector3 Point; public bool Open; }
        private struct EnvironmentHit { public float Distance; public MuseumPortal Portal; public bool Blocked; }
        private struct Placement { public string Room; public Vector3 Position; public float Size; public bool PreferAlternate; }

        public MuseumSimulation(MuseumWorld world, string startRoom = null)
        {
            World = world ?? throw new ArgumentNullException(nameof(world));
            var room = world.Rooms.TryGetValue(startRoom ?? world.StartRoom, out var start) ? start : world.Rooms.Values.First();
            State = new MuseumState { Player = Spawn(room), Checkpoint = room.Id };
            foreach (var authored in world.AuthoredObjects.Values) State.Objects.Add(authored.Id, new MuseumObject(authored.Data));
        }

        private static MuseumPlayer Spawn(MuseumRoom room)
        {
            var spawn = room.Data["spawn"];
            var up = Cardinal(MuseumWorld.Vector(spawn?["up"], Vector3.up));
            return new MuseumPlayer {
                Room = room.Id, Position = MuseumWorld.Vector(spawn?["p"], new Vector3(0, EyeHeight, 0)),
                Forward = Normalize(MuseumWorld.Vector(spawn?["forward"], Vector3.back), Vector3.back),
                Up = up == Vector3.zero ? Vector3.up : up, Scale = (float?)spawn?["scale"] ?? 1f
            };
        }
        private static Vector3 Abs(Vector3 v) => new Vector3(Mathf.Abs(v.x), Mathf.Abs(v.y), Mathf.Abs(v.z));
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        private static bool Finite(Vector3 value) => Finite(value.x) && Finite(value.y) && Finite(value.z);
        private static Vector3 Normalize(Vector3 v, Vector3 fallback) => v.magnitude > Epsilon ? v.normalized : fallback;
        private static Vector3 Cardinal(Vector3 v)
        {
            if (!Finite(v) || v.magnitude < Epsilon) return Vector3.zero;
            var a = Abs(v); var axis = a.x >= a.y && a.x >= a.z ? 0 : a.y >= a.z ? 1 : 2;
            if (a[axis] / v.magnitude < .9999f) return Vector3.zero;
            var result = Vector3.zero; result[axis] = Mathf.Sign(v[axis]); return result;
        }
        private static Vector3 CardinalOrNormalized(Vector3 v) { var c = Cardinal(v); return c == Vector3.zero ? v.normalized : c; }
        public bool Flag(string id) => id != null && Truth(State.Flags[id]);
        private static bool Truth(JToken value)
        {
            if (value == null || value.Type == JTokenType.Null) return false;
            if (value.Type == JTokenType.Boolean) return (bool)value;
            if (value.Type == JTokenType.Float || value.Type == JTokenType.Integer) return (double)value != 0;
            if (value.Type == JTokenType.String) return !string.IsNullOrEmpty((string)value);
            return true;
        }
        public bool Condition(JToken requires)
        {
            if (requires == null || requires.Type == JTokenType.Null) return true;
            if (requires.Type == JTokenType.Boolean) return (bool)requires;
            if (requires.Type == JTokenType.String) return Flag((string)requires);
            if (requires is JArray all) return all.All(Condition);
            if (requires is JObject rule)
            {
                if (rule.ContainsKey("not")) return !Condition(rule["not"]);
                if (rule["any"] is JArray any) return any.Any(Condition);
                if (rule["all"] is JArray every) return every.All(Condition);
            }
            return false;
        }
        private void Event(string type, params object[] details)
        {
            var item = new JObject { ["type"] = type };
            for (var i = 0; i + 1 < details.Length; i += 2) item[(string)details[i]] = details[i + 1] == null ? JValue.CreateNull() : JToken.FromObject(details[i + 1]);
            State.Events.Add(item);
        }
        public bool IsPortalOpen(MuseumPortal portal) => portal != null && World.Portals.TryGetValue(portal.To, out var dest) && Condition(portal.Requires) && Condition(dest.Requires);
        private bool ReplacedPortal(MuseumPortal portal) => !IsPortalOpen(portal) && World.Rooms[portal.Room].Portals.Any(other =>
            other.Id != portal.Id && IsPortalOpen(other) && Vector3.Distance(other.Center, portal.Center) < Epsilon && Vector3.Dot(other.Normal, portal.Normal) > .999f && Mathf.Abs(other.Width - portal.Width) < Epsilon && Mathf.Abs(other.Height - portal.Height) < Epsilon);
        private static Body PlayerBody(MuseumPlayer player, Vector3? position = null) => new Body {
            Center = (position ?? player.Position) - player.Up * (.7f * player.Scale),
            Extents = new Vector3(Mathf.Abs(player.Up.x) > .5f ? .9f : PlayerRadius, Mathf.Abs(player.Up.y) > .5f ? .9f : PlayerRadius, Mathf.Abs(player.Up.z) > .5f ? .9f : PlayerRadius) * player.Scale
        };
        private static Body CubeBody(Vector3 position, float size) => new Body { Center = position, Extents = Vector3.one * (size / 2) };
        private static MuseumBox ObjectBox(MuseumObject obj) => new MuseumBox(obj.Position - Vector3.one * (obj.Size / 2), obj.Position + Vector3.one * (obj.Size / 2));
        private static bool Overlaps(Body body, MuseumBox box)
        {
            for (var i = 0; i < 3; i++) if (body.Center[i] + body.Extents[i] <= box.Min[i] + Epsilon || body.Center[i] - body.Extents[i] >= box.Max[i] - Epsilon) return false;
            return true;
        }
        private static bool ApertureFits(MuseumPortal portal, Body body)
        {
            var delta = body.Center - portal.Center;
            return Mathf.Abs(Vector3.Dot(delta, portal.Right)) + Vector3.Dot(Abs(portal.Right), body.Extents) <= portal.Width / 2 + Epsilon &&
                Mathf.Abs(Vector3.Dot(delta, portal.Up)) + Vector3.Dot(Abs(portal.Up), body.Extents) <= portal.Height / 2 + Epsilon;
        }
        private bool BoundsFit(MuseumRoom room, Body body)
        {
            for (var axis = 0; axis < 3; axis++) for (var sign = -1; sign <= 1; sign += 2)
            {
                var edge = sign < 0 ? room.Min[axis] : room.Max[axis];
                if (sign * (body.Center[axis] + sign * body.Extents[axis] - edge) <= Epsilon * .001f) continue;
                var opening = false;
                foreach (var portal in room.Portals)
                    if (Mathf.Abs(portal.Center[axis] - edge) < .0001f && portal.Normal[axis] * sign < -.999f && IsPortalOpen(portal) && ApertureFits(portal, body) &&
                        Vector3.Dot(body.Center - portal.Center, portal.Normal) >= -Vector3.Dot(Abs(portal.Normal), body.Extents) - Epsilon) { opening = true; break; }
                if (!opening) return false;
            }
            return true;
        }
        private bool BodyFits(string roomId, Body body, string ignoreObject = null, bool includeObjects = true)
        {
            if (!World.Rooms.TryGetValue(roomId, out var room) || !BoundsFit(room, body)) return false;
            foreach (var solid in room.Solids) if (Condition(solid.Requires) && Overlaps(body, solid)) return false;
            if (includeObjects) foreach (var obj in State.Objects.Values)
                if (obj.Id != ignoreObject && obj.Id != State.Held && obj.Room == roomId && Condition(obj.Requires) && Overlaps(body, ObjectBox(obj))) return false;
            return true;
        }
        public bool CanPlaceObject(MuseumObject obj, string room = null, Vector3? position = null, float? size = null)
        {
            var p = position ?? obj.Position; var s = size ?? obj.Size;
            return Finite(p) && Finite(s) && s > 0 && BodyFits(room ?? obj.Room, CubeBody(p, s), obj.Id);
        }
        public bool CrossPortal(string portalId)
        {
            if (!World.Portals.TryGetValue(portalId, out var source) || source.Room != State.Player.Room || !IsPortalOpen(source)) return false;
            var dest = World.Portals[source.To]; var transform = new MuseumPortalTransform(source, dest); var player = State.Player;
            var scale = player.Scale * transform.Scale;
            if (!Finite(scale) || scale < World.MinScale - Epsilon || scale > World.MaxScale + Epsilon)
            { Event("scaleBlocked", "portal", source.Id, "scale", scale, "min", World.MinScale, "max", World.MaxScale); return false; }
            player.Position = transform.Point(player.Position);
            player.Forward = Normalize(transform.Direction(player.Forward), Vector3.back);
            player.Up = CardinalOrNormalized(transform.Direction(player.Up));
            player.Velocity = transform.Direction(player.Velocity) * transform.Scale;
            player.Scale = scale; player.Room = dest.Room;
            SnapBoundaryRoundoff(player, World.Rooms[dest.Room]);
            State.Flags["gravity:" + dest.Room] = MuseumWorld.JsonVector(player.Up);
            if (State.Held != null && State.Objects.TryGetValue(State.Held, out var held) && held.Room == source.Room)
            {
                held.Position = transform.Point(held.Position); held.Size *= transform.Scale; held.Room = dest.Room;
                held.Velocity = transform.Direction(held.Velocity) * transform.Scale;
            }
            Event("crossing", "portal", source.Id, "from", source.Room, "to", dest.Room, "scale", transform.Scale);
            return true;
        }
        private Crossing? SegmentPortal(string room, Vector3 start, Vector3 end, Func<Vector3, Body> bodyAt)
        {
            Crossing? earliest = null;
            foreach (var portal in World.Rooms[room].Portals)
            {
                if (ReplacedPortal(portal)) continue;
                var a = Vector3.Dot(start - portal.Center, portal.Normal); var b = Vector3.Dot(end - portal.Center, portal.Normal);
                if (a < -Epsilon || b >= -Epsilon || a - b < Epsilon) continue;
                var t = Mathf.Clamp01(a / (a - b)); var p = start + (end - start) * t;
                if (!ApertureFits(portal, bodyAt(p))) continue;
                if (!earliest.HasValue || t < earliest.Value.T) earliest = new Crossing { Portal = portal, T = t, Point = p, Open = IsPortalOpen(portal) };
            }
            return earliest;
        }
        private bool CrossesClosedPlane(string room, Vector3 start, Vector3 end, Func<Vector3, Body> bodyAt)
        {
            foreach (var portal in World.Rooms[room].Portals)
            {
                if (ReplacedPortal(portal)) continue;
                var a = Vector3.Dot(start - portal.Center, portal.Normal); var b = Vector3.Dot(end - portal.Center, portal.Normal);
                if ((a > Epsilon && b > Epsilon) || (a < -Epsilon && b < -Epsilon) || Mathf.Abs(a - b) < Epsilon) continue;
                var body = bodyAt(start + (end - start) * Mathf.Clamp01(a / (a - b))); var delta = body.Center - portal.Center;
                var touches = Mathf.Abs(Vector3.Dot(delta, portal.Right)) < portal.Width / 2 + Vector3.Dot(Abs(portal.Right), body.Extents) &&
                    Mathf.Abs(Vector3.Dot(delta, portal.Up)) < portal.Height / 2 + Vector3.Dot(Abs(portal.Up), body.Extents);
                if (touches && (a < -Epsilon || !IsPortalOpen(portal) || !ApertureFits(portal, body))) return true;
            }
            return false;
        }
        private void MovePlayer(Vector3 delta, int depth = 0)
        {
            if (depth >= 8) return;
            var player = State.Player; var start = player.Position; var end = start + delta;
            var crossing = SegmentPortal(player.Room, start, end, p => PlayerBody(player, p));
            if (crossing.HasValue && crossing.Value.Open)
            {
                var cross = crossing.Value; var dest = World.Portals[cross.Portal.To]; var map = new MuseumPortalTransform(cross.Portal, dest);
                var before = cross.Point + cross.Portal.Normal * (Epsilon * 8);
                var proposed = Arrival(player, cross.Point, map, dest);
                if (BodyFits(player.Room, PlayerBody(player, before)) && BodyFits(dest.Room, PlayerBody(proposed)))
                {
                    player.Position = cross.Point;
                    if (!CrossPortal(cross.Portal.Id)) { player.Position = before; return; }
                    player.Position = proposed.Position;
                    MovePlayer(map.Direction(delta) * ((1 - cross.T) * map.Scale), depth + 1); return;
                }
            }
            for (var axis = 0; axis < 3; axis++)
            {
                if (Mathf.Abs(delta[axis]) < Epsilon) continue;
                var candidate = player.Position; candidate[axis] += delta[axis];
                var axisCross = SegmentPortal(player.Room, player.Position, candidate, p => PlayerBody(player, p));
                if (axisCross.HasValue && axisCross.Value.Open)
                {
                    var cross = axisCross.Value; var dest = World.Portals[cross.Portal.To]; var map = new MuseumPortalTransform(cross.Portal, dest);
                    var proposed = Arrival(player, cross.Point, map, dest);
                    if (BodyFits(player.Room, PlayerBody(player, cross.Point)) && BodyFits(dest.Room, PlayerBody(proposed)))
                    {
                        var before = player.Position; player.Position = cross.Point;
                        if (!CrossPortal(cross.Portal.Id)) { player.Position = before; return; }
                        player.Position = proposed.Position;
                        var axisDelta = Vector3.zero; axisDelta[axis] = delta[axis];
                        MovePlayer(map.Direction(axisDelta) * ((1 - cross.T) * map.Scale), depth + 1); return;
                    }
                    player.Velocity[axis] = 0; continue;
                }
                if (!CrossesClosedPlane(player.Room, player.Position, candidate, p => PlayerBody(player, p)) && BodyFits(player.Room, PlayerBody(player, candidate))) player.Position = candidate;
                else
                {
                    float low = 0, high = 1;
                    for (var i = 0; i < 12; i++)
                    {
                        var t = (low + high) / 2; var test = player.Position; test[axis] += delta[axis] * t;
                        if (!CrossesClosedPlane(player.Room, player.Position, test, p => PlayerBody(player, p)) && BodyFits(player.Room, PlayerBody(player, test))) low = t; else high = t;
                    }
                    player.Position[axis] += delta[axis] * low; player.Velocity[axis] = 0;
                }
            }
        }
        private MuseumPlayer Arrival(MuseumPlayer player, Vector3 point, MuseumPortalTransform transform, MuseumPortal dest)
        {
            var next = player.Copy(); next.Position = transform.Point(point) + dest.Normal * (Epsilon * 8);
            next.Up = CardinalOrNormalized(transform.Direction(player.Up)); next.Scale *= transform.Scale;
            SnapBoundaryRoundoff(next, World.Rooms[dest.Room]);
            return next;
        }
        private static void SnapBoundaryRoundoff(MuseumPlayer player, MuseumRoom room)
        {
            // JavaScript computes the source transform with doubles. The float subtraction 4.4-4.2
            // instead maps the wall portal's arrival eye just below 1.6, so an otherwise exact floor
            // contact fails strict BoundsFit. Snap only a few float ULPs of penetration back INSIDE
            // the absolute boundary; do not permit a penetration tolerance that scaling can amplify.
            const float FloatSpacingAtOne = 1.1920928955078125e-7f;
            for (var axis = 0; axis < 3; axis++) for (var sign = -1; sign <= 1; sign += 2)
            {
                var body = PlayerBody(player);
                var edge = sign < 0 ? room.Min[axis] : room.Max[axis];
                var penetration = sign * (body.Center[axis] + sign * body.Extents[axis] - edge);
                var spacing = FloatSpacingAtOne * Mathf.Max(player.Scale, Mathf.Abs(player.Position[axis]), Mathf.Abs(edge));
                if (penetration > 0 && penetration <= 4 * spacing)
                    player.Position[axis] -= sign * (penetration + spacing);
            }
        }
        private static float? RayBox(Vector3 origin, Vector3 direction, MuseumBox box, float maxDistance)
        {
            float near = 0, far = maxDistance;
            for (var axis = 0; axis < 3; axis++)
            {
                if (Mathf.Abs(direction[axis]) < Epsilon) { if (origin[axis] < box.Min[axis] - Epsilon || origin[axis] > box.Max[axis] + Epsilon) return null; continue; }
                var a = (box.Min[axis] - origin[axis]) / direction[axis]; var b = (box.Max[axis] - origin[axis]) / direction[axis];
                if (a > b) { var temp = a; a = b; b = temp; }
                near = Mathf.Max(near, a); far = Mathf.Min(far, b); if (near > far + Epsilon) return null;
            }
            return far >= 0 ? Mathf.Max(0, near) : (float?)null;
        }
        private static float? RaySphere(Vector3 origin, Vector3 direction, Vector3 position, float radius)
        {
            var oc = origin - position; var b = Vector3.Dot(oc, direction); var c = Vector3.Dot(oc, oc) - radius * radius; var disc = b * b - c;
            if (disc < 0) return null;
            var t = -b - Mathf.Sqrt(disc); return t >= 0 ? t : c <= 0 ? 0 : (float?)null;
        }
        private EnvironmentHit RayEnvironment(string roomId, Vector3 origin, Vector3 direction, float maxDistance)
        {
            if (!World.Rooms.TryGetValue(roomId, out var room)) return new EnvironmentHit { Distance = 0, Blocked = true };
            var wallDistance = float.PositiveInfinity;
            for (var axis = 0; axis < 3; axis++) if (Mathf.Abs(direction[axis]) > Epsilon)
            {
                var edge = direction[axis] > 0 ? room.Max[axis] : room.Min[axis]; var t = (edge - origin[axis]) / direction[axis];
                if (t >= -Epsilon) wallDistance = Mathf.Min(wallDistance, Mathf.Max(0, t));
            }
            var result = new EnvironmentHit { Distance = Mathf.Min(maxDistance, wallDistance), Blocked = wallDistance <= maxDistance };
            foreach (var solid in room.Solids) if (Condition(solid.Requires))
            {
                var hit = RayBox(origin, direction, solid, maxDistance);
                if (hit.HasValue && hit.Value < result.Distance) { result.Distance = hit.Value; result.Blocked = true; }
            }
            foreach (var portal in room.Portals)
            {
                if (ReplacedPortal(portal)) continue;
                var denominator = Vector3.Dot(direction, portal.Normal); if (Mathf.Abs(denominator) < Epsilon) continue;
                var t = Vector3.Dot(portal.Center - origin, portal.Normal) / denominator;
                if (t < -Epsilon || t > result.Distance + Epsilon) continue;
                var delta = origin + direction * Mathf.Max(0, t) - portal.Center;
                if (Mathf.Abs(Vector3.Dot(delta, portal.Right)) > portal.Width / 2 + Epsilon || Mathf.Abs(Vector3.Dot(delta, portal.Up)) > portal.Height / 2 + Epsilon) continue;
                result.Distance = Mathf.Max(0, t); result.Blocked = true; result.Portal = denominator < -Epsilon && IsPortalOpen(portal) ? portal : null;
            }
            return result;
        }
        public MuseumRayHit Trace(float? maxDistance = null, Vector3? origin = null, Vector3? direction = null, string room = null)
        {
            var o = origin ?? State.Player.Position; var d = Normalize(direction ?? State.Player.Forward, Vector3.back); var r = room ?? State.Player.Room;
            var remaining = maxDistance ?? 2.5f * State.Player.Scale; float total = 0, metric = 1;
            if (!Finite(remaining) || remaining < 0 || !Finite(o)) return null;
            for (var hops = 0; hops <= MaxRayPortals; hops++)
            {
                var env = RayEnvironment(r, o, d, remaining); MuseumRayHit best = null; var localDistance = float.PositiveInfinity;
                foreach (var obj in State.Objects.Values) if (obj.Id != State.Held && !obj.Socketed && !Flag("socketed:" + obj.Id) && obj.Room == r && Condition(obj.Requires))
                {
                    var distance = RayBox(o, d, ObjectBox(obj), remaining);
                    if (distance.HasValue && distance.Value <= env.Distance + Epsilon && distance.Value < localDistance)
                    { best = new MuseumRayHit { Kind = "object", Id = obj.Id }; localDistance = distance.Value; }
                }
                foreach (var item in World.Interactables) if (item.Room == r && Condition(item.Requires) && !Flag((string)item.Data["hideFlag"]))
                {
                    var distance = RaySphere(o, d, item.Position, item.Radius);
                    if (distance.HasValue && distance.Value <= env.Distance + Epsilon && distance.Value < localDistance)
                    { best = new MuseumRayHit { Kind = "interactable", Id = item.Id }; localDistance = distance.Value; }
                }
                if (best != null) { best.Distance = total + localDistance / metric; best.Room = r; return best; }
                if (env.Portal == null || hops == MaxRayPortals || env.Distance >= remaining - Epsilon) return null;
                var dest = World.Portals[env.Portal.To]; var map = new MuseumPortalTransform(env.Portal, dest);
                total += env.Distance / metric; remaining = (remaining - env.Distance) * map.Scale;
                o = map.Point(o + d * env.Distance) + dest.Normal * (Epsilon * 8); d = Normalize(map.Direction(d), Vector3.back); r = dest.Room; metric *= map.Scale;
            }
            return null;
        }
        private Placement HeldPlacement(float distance, float side = 1)
        {
            var player = State.Player; var right = Normalize(Vector3.Cross(player.Forward, player.Up), Vector3.right);
            var hand = (player.Forward * distance + right * (.37f * side) - player.Up * .32f) * player.Scale;
            var room = player.Room; var origin = player.Position; var direction = Normalize(hand, Vector3.back); var remaining = hand.magnitude;
            var size = (State.HeldRatio > 0 ? State.HeldRatio : State.Objects[State.Held].Size / player.Scale) * player.Scale;
            for (var hop = 0; hop <= MaxRayPortals; hop++)
            {
                var hit = RayEnvironment(room, origin, direction, remaining);
                if (hit.Portal != null && hit.Distance < remaining && hop < MaxRayPortals)
                {
                    if (!ApertureFits(hit.Portal, CubeBody(origin + direction * hit.Distance, size)))
                    { var alternative = HeldEndpoint(room, origin, direction, size, Mathf.Max(0, hit.Distance - size * .6f)); alternative.PreferAlternate = true; return alternative; }
                    var dest = World.Portals[hit.Portal.To]; var map = new MuseumPortalTransform(hit.Portal, dest);
                    origin = map.Point(origin + direction * hit.Distance) + dest.Normal * (Epsilon * 8);
                    direction = Normalize(map.Direction(direction), Vector3.back); remaining = (remaining - hit.Distance) * map.Scale; size *= map.Scale; room = dest.Room;
                }
                else return HeldEndpoint(room, origin, direction, size, Mathf.Max(0, hit.Blocked ? Mathf.Min(remaining, hit.Distance) : remaining));
            }
            return new Placement { Room = room, Position = origin, Size = size };
        }
        private Placement HeldEndpoint(string room, Vector3 origin, Vector3 direction, float size, float limit)
        {
            bool Fits(float travel) => BodyFits(room, CubeBody(origin + direction * travel, size), State.Held);
            Placement At(float travel) => new Placement { Room = room, Position = origin + direction * travel, Size = size };
            if (Fits(limit)) return At(limit);
            var high = limit;
            for (var i = 1; i <= 32; i++)
            {
                var low = limit * (1 - i / 32f);
                if (Fits(low))
                {
                    var a = low; var b = high;
                    for (var j = 0; j < 12; j++) { var mid = (a + b) / 2; if (Fits(mid)) a = mid; else b = mid; }
                    return At(a);
                }
                high = low;
            }
            return At(limit);
        }
        private static void ApplyPlacement(MuseumObject obj, Placement placement)
        { obj.Room = placement.Room; obj.Position = placement.Position; obj.Size = placement.Size; obj.Velocity = Vector3.zero; }
        public void UpdateHeld()
        {
            if (State.Held == null || !State.Objects.TryGetValue(State.Held, out var obj)) return;
            Placement? fallback = null;
            foreach (var side in new[] { 1f, .5f, 0, -.5f, -1f })
            {
                var desired = HeldPlacement(1.05f + (State.HeldRatio > 0 ? State.HeldRatio : .5f) * .25f, side);
                if (!BodyFits(desired.Room, CubeBody(desired.Position, desired.Size), obj.Id)) continue;
                if (desired.PreferAlternate) { if (!fallback.HasValue) fallback = desired; continue; }
                ApplyPlacement(obj, desired); return;
            }
            if (fallback.HasValue) ApplyPlacement(obj, fallback.Value);
        }
        public bool PickUp(string id)
        {
            if (State.Held != null) return false;
            var hit = Trace();
            if (!State.Objects.TryGetValue(id, out var obj) || obj.Socketed || Flag("socketed:" + id) || hit == null || hit.Kind != "object" || hit.Id != id) return false;
            var apparentSize = obj.Size;
            if (obj.Room != State.Player.Room)
            {
                var room = State.Player.Room; var origin = State.Player.Position; var direction = State.Player.Forward;
                var remaining = 2.5f * State.Player.Scale; var metric = 1f;
                for (var i = 0; i < MaxRayPortals && room != obj.Room; i++)
                {
                    var env = RayEnvironment(room, origin, direction, remaining); if (env.Portal == null) break;
                    var dest = World.Portals[env.Portal.To]; var map = new MuseumPortalTransform(env.Portal, dest);
                    origin = map.Point(origin + direction * env.Distance) + dest.Normal * (Epsilon * 8); direction = Normalize(map.Direction(direction), Vector3.back);
                    remaining = (remaining - env.Distance) * map.Scale; metric *= map.Scale; room = dest.Room;
                }
                apparentSize = obj.Size / metric;
            }
            if (apparentSize > State.Player.Scale * World.PickupMaxSize) { Event("tooLarge", "id", id); return false; }
            State.Held = id; State.HeldRatio = apparentSize / State.Player.Scale; obj.Velocity = Vector3.zero;
            UpdateHeld(); Event("pickup", "id", id); return true;
        }
        public bool Drop()
        {
            if (State.Held == null || !State.Objects.TryGetValue(State.Held, out var obj)) return false;
            var candidates = new List<Placement> { new Placement { Room = obj.Room, Position = obj.Position, Size = obj.Size } };
            foreach (var distance in new[] { 1.2f, 1.6f, 2, .8f }) candidates.Add(HeldPlacement(distance));
            foreach (var placement in candidates)
            {
                if (!CanPlaceObject(obj, placement.Room, placement.Position, placement.Size)) continue;
                var box = new MuseumBox(placement.Position - Vector3.one * (placement.Size / 2), placement.Position + Vector3.one * (placement.Size / 2));
                if (placement.Room == State.Player.Room && Overlaps(PlayerBody(State.Player), box)) continue;
                ApplyPlacement(obj, placement); State.Held = null; State.HeldRatio = 0; Event("drop", "id", obj.Id, "room", obj.Room); return true;
            }
            Event("dropBlocked", "id", obj.Id); return false;
        }
        private void StepObjects(float dt)
        {
            foreach (var obj in State.Objects.Values)
            {
                if (obj.Id == State.Held || obj.Socketed || Flag("socketed:" + obj.Id) || !Condition(obj.Requires)) continue;
                if (!World.Rooms.TryGetValue(obj.Room, out var room)) { ResetObject(obj.Id); continue; }
                var up = Cardinal(MuseumWorld.Vector(State.Flags["gravity:" + room.Id]));
                if (up == Vector3.zero) up = Cardinal(MuseumWorld.Vector(room.Data["gravity"]));
                if (up == Vector3.zero) up = Vector3.up;
                obj.Velocity -= up * (13 * dt); var delta = obj.Velocity * dt; var end = obj.Position + delta;
                var crossing = SegmentPortal(obj.Room, obj.Position, end, p => CubeBody(p, obj.Size));
                if (crossing.HasValue && crossing.Value.Open)
                {
                    var dest = World.Portals[crossing.Value.Portal.To]; var map = new MuseumPortalTransform(crossing.Value.Portal, dest);
                    var p = map.Point(end) + dest.Normal * (Epsilon * 8);
                    if (BodyFits(dest.Room, CubeBody(p, obj.Size * map.Scale), obj.Id))
                    { obj.Position = p; obj.Room = dest.Room; obj.Size *= map.Scale; obj.Velocity = map.Direction(obj.Velocity) * map.Scale; continue; }
                }
                for (var axis = 0; axis < 3; axis++)
                {
                    var candidate = obj.Position; candidate[axis] += delta[axis];
                    bool Can(Vector3 p) => BodyFits(obj.Room, CubeBody(p, obj.Size), obj.Id) && !CrossesClosedPlane(obj.Room, obj.Position, p, q => CubeBody(q, obj.Size));
                    if (Can(candidate)) obj.Position = candidate;
                    else
                    {
                        float low = 0, high = 1;
                        for (var i = 0; i < 10; i++) { var t = (low + high) / 2; var p = obj.Position; p[axis] += delta[axis] * t; if (Can(p)) low = t; else high = t; }
                        obj.Position[axis] += delta[axis] * low; obj.Velocity[axis] = 0;
                    }
                }
                if (!Finite(obj.Position) || obj.Position.magnitude > 100000) ResetObject(obj.Id);
            }
        }
        public void Step(float dt, float forward = 0, float strafe = 0, bool sprint = false)
        {
            if (!Finite(dt) || dt <= 0) return;
            if (!Finite(forward)) forward = 0; if (!Finite(strafe)) strafe = 0;
            dt = Mathf.Min(dt, .1f); State.Elapsed += dt; var count = Mathf.CeilToInt(dt / (1f / 90)); var slice = dt / count;
            for (var i = 0; i < count; i++)
            {
                var p = State.Player; var flat = p.Forward - p.Up * Vector3.Dot(p.Forward, p.Up);
                var f = Normalize(flat, Mathf.Abs(p.Up.z) < .5f ? Vector3.back : Vector3.down); var right = Normalize(Vector3.Cross(f, p.Up), Vector3.right);
                var move = f * Mathf.Clamp(forward, -1, 1) + right * Mathf.Clamp(strafe, -1, 1); if (move.magnitude > 1) move.Normalize();
                var vertical = Vector3.Dot(p.Velocity, p.Up) - 13 * p.Scale * slice;
                p.Velocity = move * ((sprint ? 4.8f : 3) * p.Scale) + p.Up * vertical;
                MovePlayer(p.Velocity * slice); StepObjects(slice); UpdateHeld();
            }
            if (!Finite(State.Player.Position) || State.Player.Position.magnitude > 100000) Recover();
        }
        private static Vector3 Rotate(Vector3 value, Vector3 axis, float radians)
        {
            var c = Mathf.Cos(radians); var s = Mathf.Sin(radians);
            return value * c + Vector3.Cross(axis, value) * s + axis * (Vector3.Dot(axis, value) * (1 - c));
        }
        public void Look(float yawRadians, float pitchRadians)
        {
            if (!Finite(yawRadians) || !Finite(pitchRadians)) return;
            var p = State.Player; var forward = Normalize(Rotate(p.Forward, p.Up, -yawRadians), Vector3.back);
            var pitch = Mathf.Asin(Mathf.Clamp(Vector3.Dot(forward, p.Up), -1, 1)); var next = Mathf.Clamp(pitch - pitchRadians, -Mathf.PI * .485f, Mathf.PI * .485f);
            var right = Normalize(Vector3.Cross(forward, p.Up), Vector3.right); p.Forward = Normalize(Rotate(forward, right, next - pitch), Vector3.back);
        }
        public bool SetGravity(Vector3 newUp)
        {
            var up = Cardinal(newUp); if (up == Vector3.zero) return false;
            var player = State.Player;
            if (Vector3.Dot(player.Up, up) > .999f) { State.Flags["gravity:" + player.Room] = MuseumWorld.JsonVector(up); return true; }
            var room = World.Rooms[player.Room]; var desired = PlayerBody(player).Center + up * (.7f * player.Scale);
            var axis = Vector3.Cross(player.Up, up); var angle = Mathf.Acos(Mathf.Clamp(Vector3.Dot(player.Up, up), -1, 1));
            axis = axis.magnitude < Epsilon ? Normalize(Vector3.Cross(player.Up, player.Forward), Vector3.right) : axis.normalized;
            var proposed = player.Copy(); proposed.Up = up; proposed.Position = desired; proposed.Forward = Normalize(Rotate(player.Forward, axis, angle), Vector3.back); proposed.Velocity = Vector3.zero;
            var body = PlayerBody(proposed);
            for (var i = 0; i < 3; i++) proposed.Position[i] += Mathf.Clamp(body.Center[i], room.Min[i] + body.Extents[i], room.Max[i] - body.Extents[i]) - body.Center[i];
            if (!BodyFits(room.Id, PlayerBody(proposed)))
            {
                MuseumPlayer found = null;
                foreach (var distance in new[] { .3f, .6f, 1, 1.5f, 2 })
                {
                    foreach (var direction in new[] { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back })
                    {
                        var test = proposed.Copy(); test.Position += direction * (distance * player.Scale);
                        if (BodyFits(room.Id, PlayerBody(test))) { found = test; break; }
                    }
                }
                if (found == null) { Event("gravityBlocked"); return false; } proposed = found;
            }
            player.Position = proposed.Position; player.Forward = proposed.Forward; player.Up = proposed.Up; player.Velocity = proposed.Velocity;
            State.Flags["gravity:" + room.Id] = MuseumWorld.JsonVector(up); UpdateHeld(); Event("gravity", "room", room.Id, "up", MuseumWorld.JsonVector(up)); return true;
        }
        public bool ResetObject(string id)
        {
            if (!World.AuthoredObjects.TryGetValue(id, out var authored) || !State.Objects.TryGetValue(id, out var obj)) return false;
            var home = authored.Data["home"] ?? authored.Data;
            obj.Room = (string)home["room"]; obj.Position = MuseumWorld.Vector(home["p"]); obj.Size = (float)home["size"]; obj.Velocity = Vector3.zero;
            if (State.Held == id) { State.Held = null; State.HeldRatio = 0; } return true;
        }
        public void Recover()
        {
            var room = World.Rooms.TryGetValue(State.Checkpoint, out var checkpoint) ? checkpoint : World.Rooms.TryGetValue(World.StartRoom, out var start) ? start : World.Rooms.Values.First();
            foreach (var obj in State.Objects.Values) if (!obj.Socketed && !Flag("socketed:" + obj.Id)) ResetObject(obj.Id);
            State.Player = Spawn(room);
            foreach (var obj in State.Objects.Values)
                if (obj.Room == room.Id && Overlaps(PlayerBody(State.Player), ObjectBox(obj))) ResetObject(obj.Id);
            State.Flags["gravity:" + room.Id] = MuseumWorld.JsonVector(State.Player.Up); Event("recovery", "room", room.Id);
        }
    }
}
