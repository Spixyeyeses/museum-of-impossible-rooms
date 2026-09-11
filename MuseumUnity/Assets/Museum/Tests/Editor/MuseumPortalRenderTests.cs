using NUnit.Framework;
using UnityEngine;

namespace Museum.Tests
{
    public sealed class MuseumPortalRenderTests
    {
        [Test]
        public void RuntimeAperturesHaveNoCollidersAndReleaseTheirOwnedGeometry()
        {
            var root = new GameObject("portal test");
            try
            {
                var camera = new GameObject("camera").AddComponent<Camera>(); camera.transform.SetParent(root.transform);
                var roomA = MakeAnchor(root.transform, "A", "room", "A");
                var roomB = MakeAnchor(root.transform, "B", "room", "B");
                var a = MakeAnchor(roomA.transform, "a", "portal", "A");
                var b = MakeAnchor(roomB.transform, "b", "portal", "B");
                a.destinationId = "b"; b.destinationId = "a";
                a.sourceJson = b.sourceJson = "{\"width\":2,\"height\":3.6}";
                var renderer = root.AddComponent<MuseumPortalRenderer>();
                renderer.Initialize(camera, new[] { roomA, roomB }, new[] { a, b });
                var surface = a.transform.Find("Live portal view");
                Assert.That(surface, Is.Not.Null);
                Assert.That(surface.GetComponent<Collider>(), Is.Null);
                var mesh = surface.GetComponent<MeshFilter>().sharedMesh;
                var material = surface.GetComponent<Renderer>().sharedMaterial;
                Assert.That(mesh.bounds.size.x, Is.EqualTo(2).Within(0.0001f));
                Assert.That(mesh.bounds.size.y, Is.EqualTo(3.6f).Within(0.0001f));
                renderer.Dispose(); // EditMode does not start this non-ExecuteAlways component's runtime lifecycle.
                Object.DestroyImmediate(renderer);
                Assert.That(surface == null, Is.True);
                Assert.That(mesh == null, Is.True);
                Assert.That(material == null, Is.True);
            }
            finally { Object.DestroyImmediate(root); }
        }

        private static MuseumAnchor MakeAnchor(Transform parent, string id, string kind, string room)
        {
            var go = new GameObject(id); go.transform.SetParent(parent, false);
            var anchor = go.AddComponent<MuseumAnchor>(); anchor.sourceId = id; anchor.kind = kind; anchor.roomId = room;
            return anchor;
        }

        [Test]
        public void ReciprocalCameraMappingRestoresPoseAcrossQuarterScaleAndWallUp()
        {
            var source = new GameObject("source");
            var destination = new GameObject("destination");
            try
            {
                source.transform.SetPositionAndRotation(new Vector3(8, 2, -4), Quaternion.LookRotation(Vector3.left, Vector3.up));
                destination.transform.SetPositionAndRotation(new Vector3(160, 5, 80), Quaternion.LookRotation(Vector3.forward, Vector3.left));
                var point = new Vector3(6, 2.4f, -3);
                var rotation = Quaternion.LookRotation(new Vector3(0.6f, 0.1f, -1), Vector3.up);
                var mapped = MuseumPortalMath.TransformPoint(source.transform, destination.transform, point, 0.25f);
                var mappedRotation = MuseumPortalMath.TransformRotation(source.transform, destination.transform, rotation);
                Assert.That(Vector3.Distance(MuseumPortalMath.TransformPoint(destination.transform, source.transform, mapped, 4), point), Is.LessThan(0.0001f));
                Assert.That(Quaternion.Angle(MuseumPortalMath.TransformRotation(destination.transform, source.transform, mappedRotation), rotation), Is.LessThan(0.01f));
                Assert.That(Vector3.Distance(mapped, destination.transform.position), Is.EqualTo(Vector3.Distance(point, source.transform.position) * 0.25f).Within(0.0001f));
            }
            finally { Object.DestroyImmediate(source); Object.DestroyImmediate(destination); }
        }

        [Test]
        public void ApertureMappingFlipsRightAndNormalWhilePreservingUp()
        {
            var source = new GameObject("source");
            var destination = new GameObject("destination");
            try
            {
                destination.transform.position = new Vector3(80, 0, 160);
                Vector3 mapped = MuseumPortalMath.TransformPoint(source.transform, destination.transform, new Vector3(1, 2, 3), 0.25f);
                Assert.That(Vector3.Distance(mapped, destination.transform.position + new Vector3(-0.25f, 0.5f, -0.75f)), Is.LessThan(0.0001f));
                Quaternion entering = Quaternion.LookRotation(Vector3.back, Vector3.up);
                Quaternion outgoing = MuseumPortalMath.TransformRotation(source.transform, destination.transform, entering);
                Assert.That(Vector3.Dot(outgoing * Vector3.forward, destination.transform.forward), Is.GreaterThan(0.9999f));
                Assert.That(Vector3.Dot(outgoing * Vector3.up, destination.transform.up), Is.GreaterThan(0.9999f));
            }
            finally { Object.DestroyImmediate(source); Object.DestroyImmediate(destination); }
        }

        [Test]
        public void ExitClipPlaneKeepsDestinationInteriorAndRejectsTheSpaceBehindIt()
        {
            var cameraObject = new GameObject("virtual camera");
            var destination = new GameObject("exit");
            try
            {
                var camera = cameraObject.AddComponent<Camera>();
                destination.transform.SetPositionAndRotation(new Vector3(80, 4, 0), Quaternion.LookRotation(Vector3.left, Vector3.forward));
                camera.transform.SetPositionAndRotation(destination.transform.position - destination.transform.forward * 3,
                    Quaternion.LookRotation(destination.transform.forward, destination.transform.up));
                Vector4 plane = MuseumPortalMath.CameraClipPlane(camera, destination.transform, 0.003f);
                Vector3 inside = camera.worldToCameraMatrix.MultiplyPoint(destination.transform.position + destination.transform.forward);
                Vector3 behind = camera.worldToCameraMatrix.MultiplyPoint(destination.transform.position - destination.transform.forward);
                Assert.That(Vector4.Dot(plane, new Vector4(inside.x, inside.y, inside.z, 1)), Is.GreaterThan(0));
                Assert.That(Vector4.Dot(plane, new Vector4(behind.x, behind.y, behind.z, 1)), Is.LessThan(0));
                var projection = camera.CalculateObliqueMatrix(plane);
                for (int i = 0; i < 16; i++) Assert.That(float.IsNaN(projection[i]) || float.IsInfinity(projection[i]), Is.False);
            }
            finally { Object.DestroyImmediate(cameraObject); Object.DestroyImmediate(destination); }
        }

        [Test]
        public void NestedCameraStartsFromFreshPerspectiveAndScalesClipDistances()
        {
            var source = new GameObject("source");
            var destination = new GameObject("destination");
            var eye = new GameObject("eye");
            var view = new GameObject("view");
            try
            {
                var sourceCamera = eye.AddComponent<Camera>();
                var viewCamera = view.AddComponent<Camera>();
                sourceCamera.transform.SetPositionAndRotation(new Vector3(0, 0, 2), Quaternion.LookRotation(Vector3.back));
                sourceCamera.fieldOfView = 72; sourceCamera.aspect = 16f / 9; sourceCamera.nearClipPlane = 0.02f; sourceCamera.farClipPlane = 160;
                destination.transform.position = new Vector3(80, 0, 0);
                MuseumPortalMath.ConfigureCamera(sourceCamera, viewCamera, source.transform, destination.transform, 3.6f, 0.9f);
                Assert.That(viewCamera.nearClipPlane, Is.EqualTo(0.005f).Within(0.00001f));
                Assert.That(viewCamera.farClipPlane, Is.EqualTo(40).Within(0.0001f));
                Assert.That(viewCamera.fieldOfView, Is.EqualTo(72));
                Assert.That(viewCamera.aspect, Is.EqualTo(16f / 9).Within(0.00001f));
                Assert.That(Vector3.Distance(viewCamera.transform.position, destination.transform.position - Vector3.forward * 0.5f), Is.LessThan(0.0001f));
                Assert.That(viewCamera.enabled, Is.False);
            }
            finally { Object.DestroyImmediate(source); Object.DestroyImmediate(destination); Object.DestroyImmediate(eye); Object.DestroyImmediate(view); }
        }

        [TestCase(0.85f)]
        [TestCase(0.000001f)]
        public void DestinationClipRetainsTheFrontFaceOfAWeightBarelyInsideTheExit(float eyeDistance)
        {
            var source = new GameObject("source");
            var destination = new GameObject("destination");
            var eye = new GameObject("eye");
            var view = new GameObject("view");
            try
            {
                var sourceCamera = eye.AddComponent<Camera>();
                var viewCamera = view.AddComponent<Camera>();
                sourceCamera.transform.SetPositionAndRotation(Vector3.forward * eyeDistance, Quaternion.LookRotation(Vector3.back));
                sourceCamera.nearClipPlane = 0.01f;
                destination.transform.position = new Vector3(0, 0.45f, 73);
                MuseumPortalMath.ConfigureCamera(sourceCamera, viewCamera, source.transform, destination.transform, 3.6f, 0.9f);
                Vector3 frontFace = destination.transform.position + destination.transform.forward * 0.00001f;
                Vector4 position = viewCamera.worldToCameraMatrix * new Vector4(frontFace.x, frontFace.y, frontFace.z, 1);
                Vector4 projected = viewCamera.projectionMatrix * position;
                Assert.That(projected.z + projected.w, Is.GreaterThanOrEqualTo(-0.000001f), "A positive near-plane inset removes a just-crossed cube's only front-facing surface.");
                Assert.That(Vector3.Dot(viewCamera.transform.position - destination.transform.position, destination.transform.forward),
                    Is.LessThan(-0.00005f), "The virtual eye remains outside the exit when source eye positions approach zero.");
                for (int i = 0; i < 16; i++) Assert.That(float.IsNaN(viewCamera.projectionMatrix[i]) || float.IsInfinity(viewCamera.projectionMatrix[i]), Is.False);
            }
            finally { Object.DestroyImmediate(source); Object.DestroyImmediate(destination); Object.DestroyImmediate(eye); Object.DestroyImmediate(view); }
        }
    }
}
