#if UNITY_EDITOR
using System.Collections;
using System.Linq;
using Museum.Simulation;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;

namespace Museum.Tests
{
    /// <summary>
    /// Chapter-one acceptance route adapted from tests/replay.mjs. After Awake's authored spawn,
    /// positions, rooms, carried state and completion flags change only through the real simulation
    /// and ray-targeted MuseumPlayable.Interact calls. Steering changes the view direction and input.
    /// </summary>
    public sealed class MuseumGalleryRouteTests
    {
        private const float StepSeconds = 1f / 60f;
        private GameObject root;
        private MuseumPlayable playable;
        private int ticks;
        private MuseumSimulation Simulation => playable.Simulation;

        [UnitySetUp]
        public IEnumerator CreatePlayable()
        {
            var content = AssetDatabase.LoadAssetAtPath<TextAsset>("Assets/Museum/Content/world.v1.json");
            var layout = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Museum/Generated/CampaignLayout.prefab");
            var shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/Museum/Shaders/PortalView.shader");
            Assert.That(content, Is.Not.Null, "Export the source campaign before the gallery route.");
            Assert.That(layout, Is.Not.Null, "Import the campaign layout before the gallery route.");
            Assert.That(shader, Is.Not.Null);
            root = new GameObject("Continuous gallery acceptance route");
            root.SetActive(false);
            var cameraObject = new GameObject("Gallery route camera");
            cameraObject.transform.SetParent(root.transform, false);
            var camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = 72;
            camera.aspect = 16f / 9f;
            playable = root.AddComponent<MuseumPlayable>();
            playable.campaignContent = content;
            playable.layoutPrefab = layout;
            playable.portalShader = shader;
            playable.playerCamera = camera;
            playable.startingRoom = "c1";
            ticks = 0;
            root.SetActive(true);
            Assert.That(Simulation, Is.Not.Null);
            Assert.That(playable.MenuVisible, Is.True, "Keep hardware input and automatic stepping outside this reproducible route.");
            Assert.That(Simulation.State.Player.Room, Is.EqualTo("c1"));
            Assert.That(Vector3.Distance(Simulation.State.Player.Position, new Vector3(0, 1.6f, 5)), Is.LessThan(.0001f), "Start at the authored entrance, without setting a test pose.");
            yield return null;
        }

        [UnityTearDown]
        public IEnumerator DestroyPlayable()
        {
            if (root != null) Object.Destroy(root);
            yield return null;
            root = null;
            playable = null;
        }

        [UnityTest]
        public IEnumerator WalkTheEntireGalleryRouteAndRestoreItsIndex()
        {
            yield return Through("c1-east");
            yield return Through("c1-gallery-out");
            yield return Approach("weight1");
            playable.Interact();
            Assert.That(Simulation.State.Held, Is.EqualTo("weight1"), "The visible weight must be picked up through the ordinary interaction path.");

            yield return Through("c1-enclosure");
            yield return Through("c1-gallery-in");
            yield return Approach("plinth1");
            playable.Interact();
            playable.RefreshPresentation();
            yield return null;

            Assert.That(Simulation.State.Player.Room, Is.EqualTo("c1"));
            Assert.That(Simulation.State.Player.Scale, Is.EqualTo(1).Within(.00001f));
            Assert.That(Simulation.Flag("complete:1"), Is.True, "The continuous visit must complete the gallery index.");
            Assert.That(Simulation.Flag("solved:1"), Is.True, "The completed index must be recorded.");
            Assert.That(Simulation.State.Held, Is.Null);
            var weight = Simulation.State.Objects["weight1"];
            Assert.That(weight.Socketed, Is.True);
            Assert.That(weight.Socket, Is.EqualTo("plinth1"));
            Assert.That(weight.Room, Is.EqualTo("c1"));
            Assert.That(Vector3.Distance(weight.Position, new Vector3(-2.4f, 1.48f, 2)), Is.LessThan(.0002f));
            Assert.That(Simulation.State.Events.Where(item => (string)item["type"] == "crossing").Select(item => (string)item["portal"]).ToArray(),
                Is.EqualTo(new[] { "c1-east", "c1-gallery-out", "c1-enclosure", "c1-gallery-in" }), "Every connection must be crossed by walking in the authored order.");
            Assert.That(Simulation.State.Events.Count(item => (string)item["type"] == "pickup" && (string)item["id"] == "weight1"), Is.EqualTo(1));
            Assert.That(Simulation.State.Events.Any(item => (string)item["type"] == "recovery"), Is.False, "Recovery must not silently substitute for navigation.");

            var weightAnchor = root.GetComponentsInChildren<MuseumAnchor>(true).Single(anchor => anchor.sourceId == "weight1");
            Assert.That(weightAnchor.gameObject.activeInHierarchy, Is.True);
            Assert.That(weightAnchor.GetComponentsInChildren<Renderer>(true).Any(renderer => renderer.enabled && renderer.gameObject.activeInHierarchy), Is.True,
                "The restored weight must remain visible in the actual runtime presentation.");
            Assert.That(Vector3.Distance(weightAnchor.transform.localPosition, new Vector3(-2.4f, 1.48f, -2)), Is.LessThan(.0002f));
            TestContext.WriteLine($"Chapter 1 completed from its authored spawn in {ticks} simulation steps ({ticks * StepSeconds:0.00} s); four continuous portal crossings, ray-targeted pickup and socket interaction.");
        }

        private void Tick(float forward = 0)
        {
            Assert.That(playable.MenuVisible, Is.True, "The pilot exclusively advances simulation time.");
            Simulation.Step(StepSeconds, forward);
            ticks++;
        }

        private IEnumerator Move(Vector3 target, string label)
        {
            var player = Simulation.State.Player;
            var expectedRoom = player.Room;
            var previous = float.PositiveInfinity;
            var stalled = 0;
            // The adaptive final step avoids overshooting near portals and small exhibit stands.
            for (var iteration = 0; iteration < 30000; iteration++)
            {
                Assert.That(player.Room, Is.EqualTo(expectedRoom), "Unexpected portal while walking to " + label);
                var delta = target - player.Position;
                var flat = delta - player.Up * Vector3.Dot(delta, player.Up);
                var distance = flat.magnitude;
                if (distance < .012f * player.Scale) yield break;
                player.Forward = flat.normalized;
                Tick(Mathf.Min(1, distance / (3 * player.Scale * StepSeconds)));
                stalled = Mathf.Abs(distance - previous) < .000001f ? stalled + 1 : 0;
                previous = distance;
                Assert.That(stalled, Is.LessThan(30), $"Stalled in {player.Room} at {player.Position} toward {label} {target}; held={Simulation.State.Held}. Check collision geometry and visible exhibit placement.");
                if (ticks % 120 == 0) { playable.RefreshPresentation(); yield return null; }
            }
            Assert.Fail("Walking waypoint timed out: " + label);
        }

        private IEnumerator Through(string id)
        {
            Assert.That(Simulation.World.Portals.ContainsKey(id), Is.True, "Missing portal " + id);
            var portal = Simulation.World.Portals[id];
            var player = Simulation.State.Player;
            Assert.That(player.Room, Is.EqualTo(portal.Room), "Approaching " + id + " from the wrong room.");
            Assert.That(Simulation.IsPortalOpen(portal), Is.True, "The authored gallery connection must be available: " + id);
            var target = portal.Center - portal.Up * (portal.Height / 2) + player.Up * (MuseumSimulation.EyeHeight * player.Scale);
            yield return Move(target + portal.Normal * (.75f * player.Scale), "approach " + id);
            var oldRoom = player.Room;
            player.Forward = -portal.Normal;
            for (var frame = 0; frame < 180 && player.Room == oldRoom; frame++)
            {
                Tick(1);
                if (ticks % 120 == 0) { playable.RefreshPresentation(); yield return null; }
            }
            Assert.That(player.Room, Is.Not.EqualTo(oldRoom), $"Portal {id} did not cross from {player.Position}; scale={player.Scale}.");
            Assert.That(player.Room, Is.EqualTo(Simulation.World.Portals[portal.To].Room));
            playable.RefreshPresentation();
            yield return null;
        }

        private IEnumerator Approach(string id)
        {
            string room;
            Vector3 position;
            if (Simulation.State.Objects.TryGetValue(id, out var obj)) { room = obj.Room; position = obj.Position; }
            else
            {
                var item = Simulation.World.Interactables.Single(value => value.Id == id);
                room = item.Room;
                position = item.Position;
            }
            var player = Simulation.State.Player;
            Assert.That(player.Room, Is.EqualTo(room), "Approach " + id + " in the wrong room.");
            var target = position + Vector3.forward * (1.15f * player.Scale);
            for (var axis = 0; axis < 3; axis++) if (Mathf.Abs(player.Up[axis]) > .5f) target[axis] = player.Position[axis];
            yield return Move(target, "reach " + id);
            // Only view direction changes; the interaction itself must pass the ordinary visibility ray.
            player.Forward = (position - player.Position).normalized;
            var hit = Simulation.Trace();
            Assert.That(hit, Is.Not.Null, $"No visible ray target for {id} from {player.Position}.");
            Assert.That(hit.Id, Is.EqualTo(id), $"Expected visible ray target {id} from {player.Position}.");
            playable.RefreshPresentation();
            yield return null;
        }
    }
}
#endif
