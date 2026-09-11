using NUnit.Framework;
using UnityEngine;

namespace Museum.Tests
{
    public sealed class MuseumTravellerTests
    {
        [Test]
        public void IntersectionRequiresPlaneStraddlingAndApertureOverlap()
        {
            var portal = new GameObject("portal");
            try
            {
                var bounds = new Bounds(Vector3.zero, Vector3.one);
                Assert.That(MuseumTravellerRenderer.IntersectsAperture(bounds, Matrix4x4.TRS(new Vector3(0, 0, 0.2f), Quaternion.identity, Vector3.one * 0.8f), portal.transform, 2, 3.6f), Is.True);
                Assert.That(MuseumTravellerRenderer.IntersectsAperture(bounds, Matrix4x4.TRS(new Vector3(0, 0, 0.4f), Quaternion.identity, Vector3.one * 0.8f), portal.transform, 2, 3.6f), Is.False, "Touching does not produce a second visible half.");
                Assert.That(MuseumTravellerRenderer.IntersectsAperture(bounds, Matrix4x4.TRS(new Vector3(2, 0, 0), Quaternion.identity, Vector3.one * 0.8f), portal.transform, 2, 3.6f), Is.False, "A cube beside the frame cannot become a counterpart.");
                portal.transform.rotation = Quaternion.LookRotation(Vector3.left, Vector3.forward);
                Assert.That(MuseumTravellerRenderer.IntersectsAperture(bounds, Matrix4x4.TRS(new Vector3(-0.05f, 0, 0), Quaternion.identity, Vector3.one * 0.2f), portal.transform, 0.5f, 0.9f), Is.True, "Wall-up quarter-scale intersection.");
            }
            finally { Object.DestroyImmediate(portal); }
        }

        [Test]
        public void WeightCounterpartScalesOrientsClipsAndCleansUpWithoutOwningTheSourceMesh()
        {
            var root = new GameObject("traveller test");
            Material original = null;
            try
            {
                var roomA = Anchor(root.transform, "A", "room", "A");
                var roomB = Anchor(root.transform, "B", "room", "B");
                roomB.transform.position = new Vector3(80, 0, 0);
                var a = Anchor(roomA.transform, "a", "portal", "A");
                var b = Anchor(roomB.transform, "b", "portal", "B");
                a.destinationId = "b"; b.destinationId = "a";
                a.sourceJson = "{\"width\":2,\"height\":3.6}";
                b.sourceJson = "{\"width\":0.5,\"height\":0.9}";
                b.transform.rotation = Quaternion.LookRotation(Vector3.left, Vector3.forward);
                var weight = Anchor(roomA.transform, "weight", "object", "A");
                weight.transform.localPosition = new Vector3(0, 0, 0.2f);
                var shape = GameObject.CreatePrimitive(PrimitiveType.Cube); shape.name = "Placeholder";
                shape.transform.SetParent(weight.transform, false); shape.transform.localScale = Vector3.one * 0.8f;
                original = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                original.SetColor("_BaseColor", Color.cyan); original.SetFloat("_Metallic", 0.65f);
                var source = shape.GetComponent<MeshRenderer>(); source.sharedMaterial = original;
                var sourceMesh = shape.GetComponent<MeshFilter>().sharedMesh;
                var traveller = root.AddComponent<MuseumTravellerRenderer>();
                traveller.Initialize(new[] { roomA, roomB }, new[] { a, b }, new[] { weight }, Shader.Find("Museum/TravellerLit"));
                traveller.SetState(id => true); traveller.UpdateTravellers();
                var ghost = roomB.transform.Find("Portal counterpart weight");
                Assert.That(traveller.ActiveGhostCount, Is.EqualTo(1));
                Assert.That(ghost, Is.Not.Null);
                Assert.That(ghost.GetComponent<Collider>(), Is.Null);
                Assert.That(Vector3.Distance(ghost.position, b.transform.position - b.transform.forward * 0.05f), Is.LessThan(0.0001f));
                Assert.That(Vector3.Distance(ghost.lossyScale, Vector3.one * 0.2f), Is.LessThan(0.0001f));
                Assert.That(source.sharedMaterial.shader.name, Is.EqualTo("Museum/TravellerLit"));
                Assert.That(source.sharedMaterial.GetFloat("_Metallic"), Is.EqualTo(0.65f));
                Assert.That(source.sharedMaterial.GetVector("_ClipPlane"), Is.EqualTo(MuseumTravellerRenderer.InwardPlane(a.transform)));
                Assert.That(ghost.GetComponent<Renderer>().sharedMaterial.GetVector("_ClipPlane"), Is.EqualTo(MuseumTravellerRenderer.InwardPlane(b.transform)));
                var ghostMaterial = ghost.GetComponent<Renderer>().sharedMaterial;
                traveller.SetState(id => false); traveller.UpdateTravellers();
                Assert.That(traveller.ActiveGhostCount, Is.Zero);
                Assert.That(ghost.gameObject.activeSelf, Is.False);
                Assert.That(source.sharedMaterial, Is.SameAs(original));
                traveller.SetState(id => true); traveller.UpdateTravellers();
                // The simulation moves the authoritative object before the camera crosses. Its imported roomId stays A.
                weight.transform.SetParent(roomB.transform, false);
                weight.transform.position = b.transform.position + b.transform.forward * 0.05f;
                shape.transform.localScale = Vector3.one * 0.2f;
                traveller.UpdateTravellers();
                Assert.That(traveller.ActiveGhostCount, Is.EqualTo(1));
                Assert.That(ghost.parent, Is.SameAs(roomA.transform));
                Assert.That(Vector3.Distance(ghost.position, a.transform.position - a.transform.forward * 0.2f), Is.LessThan(0.0001f));
                Assert.That(Vector3.Distance(ghost.lossyScale, Vector3.one * 0.8f), Is.LessThan(0.0001f));
                traveller.ResetVisuals(); // Same restoration used by the runtime OnDisable callback.
                Assert.That(source.sharedMaterial, Is.SameAs(original));
                Assert.That(ghost.gameObject.activeSelf, Is.False);
                traveller.Dispose();
                Object.DestroyImmediate(traveller);
                Assert.That(ghost == null, Is.True);
                Assert.That(ghostMaterial == null, Is.True);
                Assert.That(sourceMesh != null, Is.True, "Imported/shared geometry remains owned by the source.");
            }
            finally { Object.DestroyImmediate(root); if (original != null) Object.DestroyImmediate(original); }
        }

        private static MuseumAnchor Anchor(Transform parent, string id, string kind, string room)
        {
            var go = new GameObject(id); go.transform.SetParent(parent, false);
            var anchor = go.AddComponent<MuseumAnchor>(); anchor.sourceId = id; anchor.kind = kind; anchor.roomId = room;
            return anchor;
        }
    }
}
