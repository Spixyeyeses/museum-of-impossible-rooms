#if UNITY_EDITOR
using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;

namespace Museum.Tests
{
    /// <summary>Runtime integration checks around the imported layout, controller and live portal renderer.
    /// These tests deliberately prepare isolated initial states; they do not claim a full campaign replay.
    /// </summary>
    public sealed class MuseumPlayableTests
    {
        private GameObject root;
        private MuseumPlayable playable;
        private Camera camera;

        [UnitySetUp]
        public IEnumerator CreatePlayable()
        {
            var content = AssetDatabase.LoadAssetAtPath<TextAsset>("Assets/Museum/Content/world.v1.json");
            var layout = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Museum/Generated/CampaignLayout.prefab");
            var shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/Museum/Shaders/PortalView.shader");
            Assert.That(content, Is.Not.Null, "Export the source campaign before running PlayMode tests.");
            Assert.That(layout, Is.Not.Null, "Import the campaign layout before running PlayMode tests.");
            Assert.That(shader, Is.Not.Null);
            // Configure serialized references before Awake, as the authored player scene does.
            root = new GameObject("Playable integration test");
            root.SetActive(false);
            var cameraObject = new GameObject("Test player camera");
            cameraObject.transform.SetParent(root.transform, false);
            camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = 72;
            camera.aspect = 16f / 9f;
            playable = root.AddComponent<MuseumPlayable>();
            playable.campaignContent = content;
            playable.layoutPrefab = layout;
            playable.portalShader = shader;
            playable.playerCamera = camera;
            playable.startingRoom = "c1";
            root.SetActive(true);
            Assert.That(playable.Simulation, Is.Not.Null);
            Assert.That(playable.MenuVisible, Is.True, "Keep physical input and automatic stepping out of fixtures.");
            yield return null;
        }

        [UnityTearDown]
        public IEnumerator DestroyPlayable()
        {
            if (root != null) Object.Destroy(root);
            yield return null;
            root = null; playable = null; camera = null;
        }

        [UnityTest]
        public IEnumerator AwakeBuildsEveryRoomAndCapturesTheVisibleEastPortal()
        {
            Assert.That(root.GetComponentsInChildren<MuseumAnchor>(true).Count(anchor => anchor.kind == "room"), Is.EqualTo(27));
            var player = playable.Simulation.State.Player;
            player.Position = new Vector3(5, 1.6f, 1);
            player.Forward = Vector3.right;
            playable.RefreshPresentation();
            yield return null;

            Assert.That(playable.PortalRenderer.CurrentRoom, Is.EqualTo("c1"));
            Assert.That(playable.PortalRenderer.LastViewCount, Is.GreaterThan(0), "An open doorway in front of the camera must submit a live destination view.");
            var aperture = Anchor("c1-east").transform.Find("Live portal view").GetComponent<Renderer>();
            Assert.That(aperture.enabled, Is.True);
            Assert.That(aperture.sharedMaterial.GetFloat("_Live"), Is.EqualTo(1f));
            var texture = aperture.sharedMaterial.GetTexture("_PortalView") as RenderTexture;
            Assert.That(texture, Is.Not.Null);
            Assert.That(texture.IsCreated(), Is.True);
            Assert.That(texture.width, Is.GreaterThanOrEqualTo(64));
            AssertCameraMatchesSource("c1", player.Position, Vector3.right, Vector3.up);
        }

        [UnityTest]
        public IEnumerator QuarterCrossingUpdatesCarriedGeometryCameraAndVisitReset()
        {
            playable.BeginVisit("c3");
            var simulation = playable.Simulation;
            simulation.State.Player.Position = new Vector3(0, 1.6f, -8);
            simulation.State.Player.Forward = Vector3.back;
            simulation.State.Held = "weight3";
            simulation.State.HeldRatio = 0.8f;
            simulation.State.Objects["weight3"].Position = new Vector3(0.37f, 1.28f, -7.5f);
            Assert.That(simulation.CrossPortal("quarter-in"), Is.True);
            playable.RefreshPresentation();
            yield return null;

            Assert.That(simulation.State.Player.Room, Is.EqualTo("c3-cabinet"));
            Assert.That(simulation.State.Player.Scale, Is.EqualTo(0.25f).Within(0.00001f));
            Near(simulation.State.Player.Position, new Vector3(0, 0.4f, 7));
            Assert.That(simulation.State.Objects["weight3"].Size, Is.EqualTo(0.2f).Within(0.00001f));
            Assert.That(Anchor("weight3").transform.parent, Is.EqualTo(Anchor("c3-cabinet").transform));
            Near(Anchor("weight3").transform.Find("Placeholder").localScale, Vector3.one * 0.2f);
            AssertCameraMatchesSource("c3-cabinet", new Vector3(0, 0.4f, 7), Vector3.back, Vector3.up);

            // Reusing the instantiated layout must return a carried model to its authored room and size.
            playable.BeginVisit("c1");
            yield return null;
            Assert.That(playable.Simulation.State.Held, Is.Null);
            Assert.That(Anchor("weight3").transform.parent, Is.EqualTo(Anchor("c3").transform));
            Near(Anchor("weight3").transform.localPosition, new Vector3(2, 0.4f, 2));
            Near(Anchor("weight3").transform.Find("Placeholder").localScale, Vector3.one * 0.8f);
            Assert.That(playable.PortalRenderer.CurrentRoom, Is.EqualTo("c1"));
        }

        [UnityTest]
        public IEnumerator GravitySettlesOnWallAndTraversalRestoresCameraUp()
        {
            playable.BeginVisit("c6");
            var simulation = playable.Simulation;
            simulation.State.Player.Position = new Vector3(0, 1.6f, 2);
            Assert.That(simulation.SetGravity(Vector3.left), Is.True);
            for (int frame = 0; frame < 120; frame++) simulation.Step(1f / 60f);
            playable.RefreshPresentation();
            yield return null;
            Near(simulation.State.Player.Up, Vector3.left);
            Assert.That(simulation.State.Player.Position.x, Is.EqualTo(4.4f).Within(0.0001f));
            AssertCameraMatchesSource("c6", simulation.State.Player.Position, simulation.State.Player.Forward, Vector3.left);

            // Prepare a second isolated entrance pose; the actual crossing uses ordinary movement steps.
            simulation.State.Player.Position = new Vector3(4.4f, 7, -8);
            simulation.State.Player.Forward = Vector3.back;
            simulation.State.Player.Velocity = Vector3.zero;
            for (int frame = 0; frame < 40; frame++) simulation.Step(1f / 60f, 1);
            playable.RefreshPresentation();
            yield return null;
            Assert.That(simulation.State.Player.Room, Is.EqualTo("c6-record"));
            Near(simulation.State.Player.Up, Vector3.up);
            Assert.That(simulation.State.Player.Position.y, Is.EqualTo(1.6f).Within(0.0001f));
            AssertCameraMatchesSource("c6-record", simulation.State.Player.Position, simulation.State.Player.Forward, Vector3.up);
        }

        [UnityTest]
        public IEnumerator RayTargetedSocketCompletesIndexAndSurvivesRecovery()
        {
            var simulation = playable.Simulation;
            var socketPosition = new Vector3(-2.4f, 1, 2);
            simulation.State.Player.Position = new Vector3(-2.4f, 1.6f, 3.15f);
            simulation.State.Player.Forward = (socketPosition - simulation.State.Player.Position).normalized;
            simulation.State.Held = "weight1";
            simulation.State.HeldRatio = 0.8f;
            var weight = simulation.State.Objects["weight1"];
            weight.Position = new Vector3(-2.03f, 1.28f, 2.5f);
            var hit = simulation.Trace();
            Assert.That(hit, Is.Not.Null);
            Assert.That(hit.Kind, Is.EqualTo("interactable"));
            Assert.That(hit.Id, Is.EqualTo("plinth1"));
            playable.Interact();
            playable.RefreshPresentation();
            yield return null;

            Assert.That(simulation.State.Held, Is.Null);
            Assert.That(simulation.Flag("complete:1"), Is.True);
            Assert.That(simulation.Flag("solved:1"), Is.True);
            Assert.That(weight.Socketed, Is.True);
            Assert.That(weight.Socket, Is.EqualTo("plinth1"));
            Near(weight.Position, new Vector3(-2.4f, 1.48f, 2));
            Near(Anchor("weight1").transform.localPosition, new Vector3(-2.4f, 1.48f, -2));
            playable.Recover();
            yield return null;
            Assert.That(simulation.Flag("complete:1"), Is.True);
            Assert.That(weight.Socketed, Is.True);
            Near(weight.Position, new Vector3(-2.4f, 1.48f, 2));
            Assert.That(simulation.State.Player.Room, Is.EqualTo("c1"));
            Near(simulation.State.Player.Position, new Vector3(0, 1.6f, 5));
        }

        private MuseumAnchor Anchor(string id) => root.GetComponentsInChildren<MuseumAnchor>(true).Single(anchor => anchor.sourceId == id);

        [UnityTest]
        public IEnumerator DoorwayThresholdsHaveAPositiveRevealAboveTheirAuthoredFloor()
        {
            foreach (var anchor in root.GetComponentsInChildren<MuseumAnchor>(true).Where(a => a.kind == "portal"))
            {
                var threshold = anchor.transform.Find("Threshold");
                if (threshold == null) continue;
                var portal = playable.Simulation.World.Portals[anchor.sourceId];
                float top = threshold.localPosition.y + threshold.localScale.y / 2;
                float reveal = top + portal.Height / 2;
                Assert.That(reveal / portal.Height, Is.InRange(0.001f, 0.003f),
                    anchor.sourceId + ": coplanar threshold and floor faces flicker during movement.");
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator PortalCapturesRestoreOnlyTheCurrentRoomsLightsAndKeepAStableNearPlane()
        {
            var player = playable.Simulation.State.Player;
            player.Position = new Vector3(5.999f, 1.6f, 1); player.Forward = Vector3.right;
            playable.RefreshPresentation(); playable.PortalRenderer.RenderPortals();
            Assert.That(camera.nearClipPlane, Is.EqualTo(0.035f).Within(0.000001f), "Do not sacrifice depth precision at a doorway.");
            Assert.That(playable.PortalRenderer.LastViewCount, Is.GreaterThan(0), "The aperture must survive near-plane CPU culling.");
            foreach (var room in root.GetComponentsInChildren<MuseumAnchor>(true).Where(a => a.kind == "room"))
                foreach (var light in room.GetComponentsInChildren<Light>(true))
                    Assert.That(light.enabled, Is.EqualTo(room.sourceId == player.Room), "Light leakage after a nested capture: " + room.sourceId);
            playable.PortalRenderer.enabled = false;
            Assert.That(root.GetComponentsInChildren<Light>(true).All(l => l.enabled), Is.True, "Disabling portal rendering must restore owned light states.");
            yield return null;
        }

        [UnityTest]
        public IEnumerator OrdinaryScaledAndGravityViewsRemainLitAcrossBothDirectionsOfCrossing()
        {
            foreach (bool angled in new[] { false, true })
            {
                var report = MuseumVisualAudit.Capture(playable, "Temp/visual-regression" + (angled ? "-angled" : ""), angled);
                foreach (var route in report["routes"])
                {
                    Assert.That((double)route["crossingMeanAbsoluteRgbDifference"], Is.LessThan(0.012),
                        (string)route["portal"] + ": abrupt image change between the two sides of the same doorway.");
                    foreach (var frame in route["frames"])
                        Assert.That((double)frame["meanLinearLuminance"], Is.GreaterThan(0.008),
                            (string)route["portal"] + ": a near-plane or lighting failure produced a dark frame.");
                }
            }
            yield return null;
        }

        private void AssertCameraMatchesSource(string room, Vector3 position, Vector3 forward, Vector3 up)
        {
            // Room translation is presentation-only; expected directions use the documented Z reflection.
            var roomRoot = Anchor(room).transform;
            Near(camera.transform.position, roomRoot.TransformPoint(new Vector3(position.x, position.y, -position.z)));
            Near(camera.transform.forward, new Vector3(forward.x, forward.y, -forward.z).normalized);
            Near(camera.transform.up, new Vector3(up.x, up.y, -up.z).normalized);
        }

        private static void Near(Vector3 actual, Vector3 expected) =>
            Assert.That(Vector3.Distance(actual, expected), Is.LessThan(0.0002f), $"{actual} differs from {expected}");
    }
}
#endif
