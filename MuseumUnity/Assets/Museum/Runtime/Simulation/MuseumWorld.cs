using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Museum.Simulation
{
    /// <summary>Typed source data. Coordinates remain in the browser engine's room-local space.</summary>
    public sealed class MuseumWorld
    {
        public JObject Data { get; private set; }
        public string StartRoom => (string)Data["startRoom"];
        public float MinScale => (float?)Data["minScale"] ?? .0625f;
        public float MaxScale => (float?)Data["maxScale"] ?? 4f;
        public float PickupMaxSize => (float?)Data["pickupMaxSize"] ?? 1.3f;
        public readonly Dictionary<string, MuseumRoom> Rooms = new Dictionary<string, MuseumRoom>();
        public readonly Dictionary<string, MuseumPortal> Portals = new Dictionary<string, MuseumPortal>();
        public readonly List<MuseumInteractable> Interactables = new List<MuseumInteractable>();
        public readonly Dictionary<string, MuseumObject> AuthoredObjects = new Dictionary<string, MuseumObject>();

        public static MuseumWorld Parse(string json)
        {
            var root = JObject.Parse(json);
            var world = new MuseumWorld { Data = (JObject)(root["world"] ?? root).DeepClone() };
            foreach (JObject room in world.Data["rooms"] ?? new JArray())
            {
                var item = new MuseumRoom(room);
                world.Rooms.Add(item.Id, item);
            }
            if (world.Rooms.Count == 0) throw new ArgumentException("A world needs at least one room.");
            foreach (JObject portal in world.Data["portals"] ?? new JArray())
            {
                var item = new MuseumPortal(portal);
                world.Portals.Add(item.Id, item);
                if (!world.Rooms.TryGetValue(item.Room, out var room)) throw new ArgumentException("Unknown portal room: " + item.Room);
                room.Portals.Add(item);
            }
            foreach (var portal in world.Portals.Values)
                if (!world.Portals.ContainsKey(portal.To)) throw new ArgumentException("Unknown portal destination: " + portal.To);
            foreach (JObject item in world.Data["interactables"] ?? new JArray()) world.Interactables.Add(new MuseumInteractable(item));
            foreach (JObject item in world.Data["objects"] ?? new JArray())
            {
                var obj = new MuseumObject(item);
                world.AuthoredObjects.Add(obj.Id, obj);
            }
            return world;
        }

        public static Vector3 Vector(JToken token, Vector3 fallback = default)
        {
            if (!(token is JArray values) || values.Count != 3) return fallback;
            return new Vector3((float)values[0], (float)values[1], (float)values[2]);
        }
        public static JArray JsonVector(Vector3 value) => new JArray(value.x, value.y, value.z);
    }

    public sealed class MuseumRoom
    {
        public readonly JObject Data;
        public string Id => (string)Data["id"];
        public string Name => (string)Data["name"] ?? Id;
        public readonly Vector3 Min, Max;
        public readonly List<MuseumBox> Solids = new List<MuseumBox>();
        public readonly List<MuseumPortal> Portals = new List<MuseumPortal>();
        public MuseumRoom(JObject data)
        {
            Data = data;
            Min = MuseumWorld.Vector(data["bounds"]?["min"]);
            Max = MuseumWorld.Vector(data["bounds"]?["max"]);
            foreach (JObject solid in data["solids"] ?? new JArray())
                Solids.Add(new MuseumBox(MuseumWorld.Vector(solid["min"]), MuseumWorld.Vector(solid["max"]), solid["requires"]));
        }
    }

    public sealed class MuseumPortal
    {
        public readonly JObject Data;
        public string Id => (string)Data["id"];
        public string Room => (string)Data["room"];
        public string To => (string)Data["to"];
        public JToken Requires => Data["requires"];
        public Vector3 Center, Normal, Up;
        public float Width, Height;
        public Vector3 Right => Vector3.Cross(Up, Normal).normalized;
        public MuseumPortal(JObject data)
        {
            Data = data;
            Center = MuseumWorld.Vector(data["center"]);
            Normal = MuseumWorld.Vector(data["normal"], Vector3.forward).normalized;
            var right = Vector3.Cross(MuseumWorld.Vector(data["up"], Vector3.up), Normal).normalized;
            Up = Vector3.Cross(Normal, right).normalized;
            Width = (float)data["width"];
            Height = (float)data["height"];
        }
    }

    public sealed class MuseumInteractable
    {
        public readonly JObject Data;
        public string Id => (string)Data["id"];
        public string Room => (string)Data["room"];
        public string Type => (string)Data["type"];
        public string Label => (string)Data["label"] ?? Id;
        public Vector3 Position => MuseumWorld.Vector(Data["p"]);
        public float Radius => (float?)Data["radius"] ?? .35f;
        public JToken Requires => Data["requires"];
        public MuseumInteractable(JObject data) { Data = data; }
    }

    public sealed class MuseumObject
    {
        public JObject Data;
        public string Id;
        public string Room;
        public Vector3 Position, Velocity;
        public float Size;
        public bool Socketed;
        public string Socket;
        public JToken Requires => Data["requires"];
        public MuseumObject(JObject data)
        {
            Data = (JObject)data.DeepClone();
            Id = (string)data["id"];
            Room = (string)data["room"];
            Position = MuseumWorld.Vector(data["p"]);
            Size = (float)data["size"];
            Socketed = (bool?)data["socketed"] ?? false;
            Socket = (string)data["socket"];
        }
    }

    public struct MuseumBox
    {
        public Vector3 Min, Max;
        public JToken Requires;
        public MuseumBox(Vector3 min, Vector3 max, JToken requires = null) { Min = min; Max = max; Requires = requires; }
    }

    public sealed class MuseumPlayer
    {
        public string Room;
        public Vector3 Position, Forward, Up, Velocity;
        public float Scale = 1;
        public MuseumPlayer Copy() => (MuseumPlayer)MemberwiseClone();
    }

    public sealed class MuseumState
    {
        public MuseumPlayer Player;
        public readonly Dictionary<string, MuseumObject> Objects = new Dictionary<string, MuseumObject>();
        public readonly JObject Flags = new JObject();
        public readonly List<JObject> Events = new List<JObject>();
        public readonly List<string> Solved = new List<string>();
        public string Held, Checkpoint;
        public float HeldRatio, Elapsed;
    }

    public sealed class MuseumRayHit
    {
        public string Kind, Id, Room;
        public float Distance;
    }

    public readonly struct MuseumPortalTransform
    {
        private readonly MuseumPortal source, destination;
        public float Scale { get; }
        public MuseumPortalTransform(MuseumPortal source, MuseumPortal destination)
        {
            this.source = source;
            this.destination = destination;
            Scale = destination.Height / source.Height;
            if (float.IsNaN(Scale) || float.IsInfinity(Scale) || Scale <= 0) throw new ArgumentException("Portal apertures require positive heights.");
        }
        public Vector3 Direction(Vector3 value) =>
            destination.Right * -Vector3.Dot(value, source.Right) + destination.Up * Vector3.Dot(value, source.Up) + destination.Normal * -Vector3.Dot(value, source.Normal);
        public Vector3 Point(Vector3 value) => destination.Center + Direction(value - source.Center) * Scale;
    }
}
