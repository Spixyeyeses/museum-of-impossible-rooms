using System;
using System.IO;
using System.Linq;
using Museum.Simulation;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Museum.Tests
{
    public sealed class MuseumSimulationTests
    {
        private const float PositionTolerance = .0001f;
        private const float DirectionTolerance = .00001f;
        private static JObject Fixtures => JObject.Parse(File.ReadAllText("Assets/Museum/Content/engine-fixtures.v1.json"));
        private static MuseumWorld Campaign() => MuseumWorld.Parse(File.ReadAllText("Assets/Museum/Content/world.v1.json"));

        [TestCase("c1-east")]
        [TestCase("c1-gallery-in")]
        [TestCase("quarter-in")]
        [TestCase("quarter-out")]
        [TestCase("wall6-in")]
        [TestCase("wall6-out")]
        public void PortalTransformMatchesBrowserFixture(string id)
        {
            var fixture = Fixtures["transforms"].Single(value => (string)value["id"] == id);
            var world = Campaign();
            var transform = new MuseumPortalTransform(world.Portals[(string)fixture["sourcePortal"]], world.Portals[(string)fixture["destinationPortal"]]);
            Assert.That(transform.Scale, Is.EqualTo((float)fixture["expected"]["scale"]).Within(DirectionTolerance));
            var points = (JArray)fixture["points"];
            for (var i = 0; i < points.Count; i++) Near(transform.Point(MuseumWorld.Vector(points[i])), MuseumWorld.Vector(fixture["expected"]["points"][i]), PositionTolerance, id + ".point[" + i + "]");
            var directions = (JArray)fixture["directions"];
            for (var i = 0; i < directions.Count; i++) Near(transform.Direction(MuseumWorld.Vector(directions[i])), MuseumWorld.Vector(fixture["expected"]["directions"][i]), DirectionTolerance, id + ".direction[" + i + "]");
        }

        [TestCase("ordinary-continuous-crossing")]
        [TestCase("ordinary-continuous-return")]
        [TestCase("quarter-continuous-held-crossing")]
        [TestCase("quarter-explicit-velocity-crossing")]
        [TestCase("wall-gravity-continuous-crossing")]
        [TestCase("floor-look")]
        [TestCase("wall-look")]
        [TestCase("gravity-change-and-settle")]
        [TestCase("solid-blocks-movement")]
        [TestCase("weight-pickup-drop")]
        public void NativeSimulationMatchesBrowserFixture(string id)
        {
            var fixture = Fixtures["simulations"].Single(value => (string)value["id"] == id);
            var sim = new MuseumSimulation(Campaign());
            LoadInitialState(sim.State, fixture["initialState"]);
            var actions = (JArray)fixture["actions"];
            for (var i = 0; i < actions.Count; i++)
            {
                var action = actions[i]; bool? returned = null;
                switch ((string)action["kind"])
                {
                    case "step":
                        for (var frame = 0; frame < (int)action["frames"]; frame++) sim.Step((float)action["dt"], (float?)action["input"]?["forward"] ?? 0, (float?)action["input"]?["strafe"] ?? 0, (bool?)action["input"]?["sprint"] ?? false);
                        break;
                    case "look": sim.Look((float)action["yaw"], (float)action["pitch"]); break;
                    case "setGravity": returned = sim.SetGravity(MuseumWorld.Vector(action["up"])); break;
                    case "crossPortal": returned = sim.CrossPortal((string)action["portalId"]); break;
                    case "pickUp": returned = sim.PickUp((string)action["objectId"]); break;
                    case "drop": returned = sim.Drop(); break;
                    default: Assert.Fail("Unsupported browser fixture action: " + action["kind"]); break;
                }
                if (returned.HasValue)
                {
                    var expectedReturn = fixture["returns"].Single(value => (int)value["actionIndex"] == i);
                    Assert.That(returned.Value, Is.EqualTo((bool)expectedReturn["value"]), id + ".return[" + i + "]");
                }
            }
            CompareState(sim.State, fixture["expected"], id);
        }

        [Test]
        public void ContinuousQuarterScaleCrossingAndReturnPreserveCarriedWeight()
        {
            var sim = new MuseumSimulation(SmallWorld(true, true));
            sim.State.Player.Position = new Vector3(0, 1.6f, -2);
            sim.State.Player.Forward = new Vector3(0, -.08f, -.9968f);
            Assert.That(sim.PickUp("cube"), Is.True);
            sim.State.Player.Forward = Vector3.back;
            Walk(sim, 1, 1.4f);
            Assert.That(sim.State.Player.Room, Is.EqualTo("b"));
            Assert.That(sim.State.Player.Scale, Is.EqualTo(.25f).Within(DirectionTolerance));
            Assert.That(sim.State.Player.Position.y, Is.EqualTo(.4f).Within(.005f));
            Assert.That(sim.State.Objects["cube"].Room, Is.EqualTo("b"));
            Assert.That(sim.State.Objects["cube"].Size, Is.EqualTo(.2f).Within(DirectionTolerance));
            Walk(sim, -1, 1.4f);
            Assert.That(sim.State.Player.Room, Is.EqualTo("a"));
            Assert.That(sim.State.Player.Scale, Is.EqualTo(1).Within(DirectionTolerance));
            Assert.That(sim.State.Objects["cube"].Size, Is.EqualTo(.8f).Within(DirectionTolerance));
        }

        [TestCase("locked")]
        [TestCase("narrow")]
        [TestCase("solid")]
        public void CollisionRejectsClosedOrTooNarrowApertures(string scenario)
        {
            var world = SmallWorld();
            if (scenario == "locked") world.Portals["ab"].Data["requires"] = "unlocked";
            if (scenario == "narrow") world.Portals["ab"].Width = .3f;
            if (scenario == "solid") world.Rooms["a"].Solids.Add(new MuseumBox(new Vector3(-2, 0, -4), new Vector3(2, 4, -3.8f)));
            var sim = new MuseumSimulation(world); sim.State.Player.Position = new Vector3(0, 1.6f, -3);
            Walk(sim, 1, 2);
            Assert.That(sim.State.Player.Room, Is.EqualTo("a"));
            Assert.That(sim.State.Player.Position.z, Is.GreaterThan(-4.77f));
        }

        [Test]
        public void InteractionRayTraversesScaleAndObeysDestinationOcclusion()
        {
            var world = SmallWorld(true);
            world.Interactables.Add(new MuseumInteractable(JObject.Parse("{'id':'button','room':'b','p':[4.7,0.4,0],'radius':0.05,'type':'button'}")));
            var sim = new MuseumSimulation(world); sim.State.Player.Position = new Vector3(0, 1.6f, -4);
            var hit = sim.Trace();
            Assert.That(hit, Is.Not.Null); Assert.That(hit.Id, Is.EqualTo("button")); Assert.That(hit.Room, Is.EqualTo("b"));
            Assert.That(hit.Distance, Is.EqualTo(2).Within(.001f)); Assert.That(sim.Trace(1.9f), Is.Null);
            world.Rooms["b"].Solids.Add(new MuseumBox(new Vector3(4.82f, 0, -1), new Vector3(4.88f, 1, 1)));
            Assert.That(sim.Trace(), Is.Null);
        }

        [Test]
        public void DroppedWeightCannotEmbedInWallAndSettlesOnFloor()
        {
            var sim = new MuseumSimulation(SmallWorld(false, true));
            sim.State.Player.Position = new Vector3(0, 1.6f, -2); sim.State.Player.Forward = new Vector3(0, -.08f, -.9968f);
            Assert.That(sim.PickUp("cube"), Is.True);
            sim.State.Player.Position = new Vector3(4.7f, 1.6f, 0); sim.State.Player.Forward = Vector3.right; sim.Step(1f / 60);
            if (sim.Drop()) Assert.That(sim.CanPlaceObject(sim.State.Objects["cube"]), Is.True);
            else Assert.That(sim.State.Held, Is.EqualTo("cube"));
            if (sim.State.Held != null)
            {
                sim.State.Player.Position = new Vector3(0, 1.6f, 2); sim.State.Player.Forward = Vector3.back; sim.Step(1f / 60);
                Assert.That(sim.Drop(), Is.True);
            }
            Walk(sim, 0, 1);
            Assert.That(sim.State.Objects["cube"].Position.y, Is.EqualTo(.4f).Within(.002f));
        }

        [Test]
        public void ConditionsAndRecoveryPreservePuzzleFlags()
        {
            var sim = new MuseumSimulation(SmallWorld(false, true));
            sim.State.Flags["open"] = true;
            Assert.That(sim.Condition(JToken.Parse("['open',{'not':'closed'}]")), Is.True);
            Assert.That(sim.Condition(JToken.Parse("{'any':['open','closed']}")), Is.True);
            Assert.That(sim.Condition(JToken.Parse("{'unknown':3}")), Is.False);
            sim.State.Checkpoint = "b"; sim.State.Objects["cube"].Room = "b"; sim.State.Objects["cube"].Size = .2f;
            sim.State.Held = "cube"; sim.Recover();
            Assert.That(sim.State.Player.Room, Is.EqualTo("b")); Assert.That(sim.Flag("open"), Is.True);
            Assert.That(sim.State.Held, Is.Null); Assert.That(sim.State.Objects["cube"].Room, Is.EqualTo("a"));
            Assert.That(sim.State.Objects["cube"].Size, Is.EqualTo(.8f));
        }

        private static void Walk(MuseumSimulation sim, float forward, float seconds)
        { for (var i = 0; i < Mathf.RoundToInt(seconds * 120); i++) sim.Step(1f / 120, forward); }
        private static MuseumWorld SmallWorld(bool scaled = false, bool cube = false)
        {
            var data = JObject.Parse(@"{
                'startRoom':'a',
                'rooms':[
                    {'id':'a','bounds':{'min':[-5,0,-5],'max':[5,6,5]},'spawn':{'p':[0,1.6,2],'forward':[0,0,-1],'up':[0,1,0]},'solids':[]},
                    {'id':'b','bounds':{'min':[-5,0,-5],'max':[5,6,5]},'spawn':{'p':[0,1.6,2],'forward':[0,0,-1],'up':[0,1,0]},'solids':[]}],
                'portals':[
                    {'id':'ab','room':'a','center':[0,1.8,-5],'normal':[0,0,1],'up':[0,1,0],'to':'ba','height':3.6,'width':2.4},
                    {'id':'ba','room':'b','center':[5,1.8,0],'normal':[-1,0,0],'up':[0,1,0],'to':'ab','height':3.6,'width':2.4}],
                'objects':[], 'interactables':[] }");
            if (scaled) { data["portals"][1]["height"] = .9; data["portals"][1]["width"] = .6; data["portals"][1]["center"] = new JArray(5, .45, 0); }
            if (cube) ((JArray)data["objects"]).Add(JObject.Parse("{'id':'cube','room':'a','p':[0,1.35,-3.2],'size':0.8}"));
            return MuseumWorld.Parse(data.ToString());
        }

        private static void LoadInitialState(MuseumState state, JToken initial)
        {
            var p = initial["player"];
            state.Player = new MuseumPlayer { Room = (string)p["room"], Position = MuseumWorld.Vector(p["p"]), Forward = MuseumWorld.Vector(p["forward"]), Up = MuseumWorld.Vector(p["up"]), Velocity = MuseumWorld.Vector(p["velocity"]), Scale = (float)p["scale"] };
            state.Flags.RemoveAll(); foreach (var flag in ((JObject)initial["flags"]).Properties()) state.Flags[flag.Name] = flag.Value.DeepClone();
            state.Objects.Clear(); foreach (var obj in ((JObject)initial["objects"]).Properties())
            {
                var item = new MuseumObject((JObject)obj.Value) { Velocity = MuseumWorld.Vector(obj.Value["velocity"]) };
                state.Objects.Add(item.Id, item);
            }
            state.Held = (string)initial["held"]; state.HeldRatio = (float?)initial["heldRatio"] ?? 0;
            state.Checkpoint = (string)initial["checkpoint"]; state.Elapsed = (float)initial["elapsed"];
            state.Events.Clear(); foreach (JObject ev in initial["events"] ?? new JArray()) state.Events.Add((JObject)ev.DeepClone());
        }
        private static void CompareState(MuseumState actual, JToken expected, string context)
        {
            var p = expected["player"];
            Assert.That(actual.Player.Room, Is.EqualTo((string)p["room"]), context + ".player.room");
            Near(actual.Player.Position, MuseumWorld.Vector(p["p"]), PositionTolerance, context + ".player.p");
            Near(actual.Player.Forward, MuseumWorld.Vector(p["forward"]), DirectionTolerance, context + ".player.forward");
            Near(actual.Player.Up, MuseumWorld.Vector(p["up"]), DirectionTolerance, context + ".player.up");
            Near(actual.Player.Velocity, MuseumWorld.Vector(p["velocity"]), PositionTolerance, context + ".player.velocity");
            Assert.That(actual.Player.Scale, Is.EqualTo((float)p["scale"]).Within(DirectionTolerance), context + ".player.scale");
            Assert.That(actual.Held, Is.EqualTo((string)expected["held"]), context + ".held");
            Assert.That(actual.HeldRatio, Is.EqualTo((float?)expected["heldRatio"] ?? 0).Within(DirectionTolerance), context + ".heldRatio");
            Assert.That(actual.Elapsed, Is.EqualTo((float)expected["elapsed"]).Within(DirectionTolerance), context + ".elapsed");
            Assert.That(actual.Checkpoint, Is.EqualTo((string)expected["checkpoint"]), context + ".checkpoint");
            foreach (var pair in ((JObject)expected["objects"]).Properties())
            {
                Assert.That(actual.Objects.ContainsKey(pair.Name), Is.True, context + ".objects." + pair.Name);
                var obj = actual.Objects[pair.Name]; var value = pair.Value;
                Assert.That(obj.Room, Is.EqualTo((string)value["room"]), context + ".objects." + pair.Name + ".room");
                Near(obj.Position, MuseumWorld.Vector(value["p"]), PositionTolerance, context + ".objects." + pair.Name + ".p");
                Near(obj.Velocity, MuseumWorld.Vector(value["velocity"]), PositionTolerance, context + ".objects." + pair.Name + ".velocity");
                Assert.That(obj.Size, Is.EqualTo((float)value["size"]).Within(DirectionTolerance), context + ".objects." + pair.Name + ".size");
            }
            CompareJson(actual.Flags, expected["flags"], context + ".flags");
            CompareJson(new JArray(actual.Events), expected["events"], context + ".events");
        }
        private static void Near(Vector3 actual, Vector3 expected, float tolerance, string context)
        { for (var axis = 0; axis < 3; axis++) Assert.That(actual[axis], Is.EqualTo(expected[axis]).Within(tolerance), context + "[" + axis + "]"); }
        private static void CompareJson(JToken actual, JToken expected, string context)
        {
            Assert.That(actual, Is.Not.Null, context);
            if (expected.Type == JTokenType.Float || expected.Type == JTokenType.Integer)
            { Assert.That((double)actual, Is.EqualTo((double)expected).Within(PositionTolerance), context); return; }
            if (expected is JObject obj)
            {
                Assert.That(actual is JObject, Is.True, context);
                Assert.That(((JObject)actual).Count, Is.EqualTo(obj.Count), context + ".count");
                foreach (var pair in obj.Properties()) CompareJson(actual[pair.Name], pair.Value, context + "." + pair.Name);
            }
            else if (expected is JArray array)
            {
                Assert.That(actual is JArray, Is.True, context); Assert.That(((JArray)actual).Count, Is.EqualTo(array.Count), context + ".count");
                for (var i = 0; i < array.Count; i++) CompareJson(actual[i], array[i], context + "[" + i + "]");
            }
            else Assert.That(JToken.DeepEquals(actual, expected), Is.True, context + " expected " + expected + " got " + actual);
        }
    }
}
