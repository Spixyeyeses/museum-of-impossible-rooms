using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace Museum
{
    /// <summary>Splits an authoritative weight between paired room frames without creating another physics object.</summary>
    [DefaultExecutionOrder(500)]
    public sealed class MuseumTravellerRenderer : MonoBehaviour, IDisposable
    {
        private sealed class Portal
        {
            public MuseumAnchor anchor;
            public float width, height;
        }

        private sealed class Traveller
        {
            public MuseumAnchor anchor;
            public MeshRenderer source;
            public Mesh mesh;
            public Material[] originals, clipped, ghostMaterials;
            public GameObject ghost;
            public MeshRenderer ghostRenderer;
        }

        private readonly Dictionary<string, MuseumAnchor> rooms = new Dictionary<string, MuseumAnchor>();
        private readonly Dictionary<string, Portal> portals = new Dictionary<string, Portal>();
        private readonly Dictionary<string, List<Portal>> roomPortals = new Dictionary<string, List<Portal>>();
        private readonly List<Traveller> travellers = new List<Traveller>();
        private Shader shader;
        private Func<string, bool> isOpen;
        public int ActiveGhostCount { get; private set; }
        private static readonly int ClipPlane = Shader.PropertyToID("_ClipPlane");

        public void Initialize(MuseumAnchor[] roomAnchors, MuseumAnchor[] portalAnchors, MuseumAnchor[] objectAnchors, Shader travellerShader)
        {
            ReleaseResources();
            shader = travellerShader != null ? travellerShader : Shader.Find("Museum/TravellerLit");
            if (shader == null) throw new InvalidOperationException("Museum/TravellerLit shader is missing from this player.");
            foreach (var room in roomAnchors)
            {
                if (room == null || room.kind != "room") continue;
                rooms.Add(room.sourceId, room);
                roomPortals.Add(room.sourceId, new List<Portal>());
            }
            foreach (var anchor in portalAnchors)
            {
                if (anchor == null || anchor.kind != "portal") continue;
                var data = JObject.Parse(anchor.sourceJson);
                var portal = new Portal { anchor = anchor, width = (float)data["width"], height = (float)data["height"] };
                MuseumPortalMath.Scale(portal.height, portal.height);
                portals.Add(anchor.sourceId, portal);
                roomPortals[anchor.roomId].Add(portal);
            }
            foreach (var anchor in objectAnchors)
            {
                if (anchor == null || anchor.kind != "object") continue;
                var shape = anchor.transform.Find("Placeholder");
                var renderer = shape != null ? shape.GetComponent<MeshRenderer>() : null;
                var filter = shape != null ? shape.GetComponent<MeshFilter>() : null;
                if (renderer == null || filter == null || filter.sharedMesh == null) continue;
                travellers.Add(new Traveller { anchor = anchor, source = renderer, mesh = filter.sharedMesh,
                    originals = renderer.sharedMaterials });
            }
        }

        /// <summary>Both endpoint IDs must be open; room identity comes from the authoritative object's current parent.</summary>
        public void SetState(Func<string, bool> portalIsOpen) => isOpen = portalIsOpen;
        private void LateUpdate() => UpdateTravellers();

        public void UpdateTravellers()
        {
            ActiveGhostCount = 0;
            foreach (var traveller in travellers)
            {
                RestoreTraveller(traveller);
                if (traveller.source == null || !traveller.source.enabled || !traveller.source.gameObject.activeInHierarchy) continue;
                var room = CurrentRoom(traveller.anchor.transform);
                if (room == null || !roomPortals.TryGetValue(room, out var candidates)) continue;
                foreach (var source in candidates)
                {
                    if (!portals.TryGetValue(source.anchor.destinationId ?? "", out var destination) || !Open(source, destination)) continue;
                    if (!IntersectsAperture(traveller.mesh.bounds, traveller.source.localToWorldMatrix, source.anchor.transform, source.width, source.height)) continue;
                    EnsureGhost(traveller);
                    traveller.source.sharedMaterials = traveller.clipped;
                    SetPlane(traveller.clipped, InwardPlane(source.anchor.transform));
                    var targetRoom = rooms[destination.anchor.roomId].transform;
                    traveller.ghost.transform.SetParent(targetRoom, false);
                    float ratio = MuseumPortalMath.Scale(source.height, destination.height);
                    CalculateGhostPose(traveller.source.transform, source.anchor.transform, destination.anchor.transform, ratio,
                        out var position, out var rotation, out var worldScale);
                    traveller.ghost.transform.SetPositionAndRotation(position, rotation);
                    Vector3 parentScale = targetRoom.lossyScale;
                    traveller.ghost.transform.localScale = new Vector3(worldScale.x / parentScale.x, worldScale.y / parentScale.y, worldScale.z / parentScale.z);
                    SetPlane(traveller.ghostMaterials, InwardPlane(destination.anchor.transform));
                    traveller.ghostRenderer.enabled = true;
                    traveller.ghost.SetActive(true);
                    ActiveGhostCount++;
                    break; // Current authored weights can intersect one aperture at a time.
                }
            }
        }

        private bool Open(Portal source, Portal destination) => isOpen != null
            ? isOpen(source.anchor.sourceId) && isOpen(destination.anchor.sourceId)
            : source.anchor.initiallyAvailable && destination.anchor.initiallyAvailable;

        private string CurrentRoom(Transform objectTransform)
        {
            for (var parent = objectTransform.parent; parent != null; parent = parent.parent)
            {
                var anchor = parent.GetComponent<MuseumAnchor>();
                if (anchor != null && anchor.kind == "room" && rooms.ContainsKey(anchor.sourceId)) return anchor.sourceId;
            }
            return null;
        }

        /// <summary>Conservative OBB/rectangle overlap, exact for the campaign's cardinal cubes and aperture frames.</summary>
        public static bool IntersectsAperture(Bounds meshBounds, Matrix4x4 objectToWorld, Transform portal, float width, float height)
        {
            Vector3 offset = objectToWorld.MultiplyPoint3x4(meshBounds.center) - portal.position;
            Vector3 x = objectToWorld.MultiplyVector(new Vector3(meshBounds.extents.x, 0, 0));
            Vector3 y = objectToWorld.MultiplyVector(new Vector3(0, meshBounds.extents.y, 0));
            Vector3 z = objectToWorld.MultiplyVector(new Vector3(0, 0, meshBounds.extents.z));
            float normalRadius = ProjectionRadius(portal.forward, x, y, z);
            // Strict plane intersection avoids duplicating a cube that merely touches the doorway.
            if (normalRadius <= 0 || Mathf.Abs(Vector3.Dot(offset, portal.forward)) >= normalRadius - 0.000001f) return false;
            return Mathf.Abs(Vector3.Dot(offset, portal.right)) < width / 2 + ProjectionRadius(portal.right, x, y, z)
                && Mathf.Abs(Vector3.Dot(offset, portal.up)) < height / 2 + ProjectionRadius(portal.up, x, y, z);
        }

        private static float ProjectionRadius(Vector3 axis, Vector3 x, Vector3 y, Vector3 z) =>
            Mathf.Abs(Vector3.Dot(axis, x)) + Mathf.Abs(Vector3.Dot(axis, y)) + Mathf.Abs(Vector3.Dot(axis, z));

        public static Vector4 InwardPlane(Transform portal)
        {
            Vector3 normal = portal.forward;
            return new Vector4(normal.x, normal.y, normal.z, -Vector3.Dot(normal, portal.position));
        }

        public static void CalculateGhostPose(Transform shape, Transform source, Transform destination, float ratio,
            out Vector3 position, out Quaternion rotation, out Vector3 worldScale)
        {
            position = MuseumPortalMath.TransformPoint(source, destination, shape.position, ratio);
            rotation = MuseumPortalMath.TransformRotation(source, destination, shape.rotation);
            worldScale = shape.lossyScale * ratio;
        }

        private void EnsureGhost(Traveller traveller)
        {
            if (traveller.ghost != null) return;
            traveller.clipped = CloneMaterials(traveller.originals, "Source clipped ");
            traveller.ghostMaterials = CloneMaterials(traveller.originals, "Destination clipped ");
            traveller.ghost = new GameObject("Portal counterpart " + traveller.anchor.sourceId);
            traveller.ghost.AddComponent<MeshFilter>().sharedMesh = traveller.mesh; // Shared asset is never destroyed here.
            traveller.ghostRenderer = traveller.ghost.AddComponent<MeshRenderer>();
            traveller.ghostRenderer.sharedMaterials = traveller.ghostMaterials;
            traveller.ghostRenderer.shadowCastingMode = traveller.source.shadowCastingMode;
            traveller.ghostRenderer.receiveShadows = traveller.source.receiveShadows;
            traveller.ghostRenderer.lightProbeUsage = LightProbeUsage.BlendProbes;
            traveller.ghostRenderer.reflectionProbeUsage = ReflectionProbeUsage.BlendProbes;
            traveller.ghostRenderer.renderingLayerMask = traveller.source.renderingLayerMask;
            traveller.ghost.layer = traveller.source.gameObject.layer;
        }

        private Material[] CloneMaterials(Material[] originals, string prefix)
        {
            var result = new Material[originals.Length];
            for (int i = 0; i < originals.Length; i++)
            {
                var original = originals[i];
                var material = new Material(shader) { name = prefix + (original != null ? original.name : "weight") };
                if (original != null)
                {
                    foreach (string property in new[] { "_BaseColor", "_EmissionColor" })
                        if (original.HasProperty(property)) material.SetColor(property, original.GetColor(property));
                    foreach (string property in new[] { "_Metallic", "_Smoothness" })
                        if (original.HasProperty(property)) material.SetFloat(property, original.GetFloat(property));
                    if (original.HasProperty("_BaseMap"))
                    {
                        material.SetTexture("_BaseMap", original.GetTexture("_BaseMap"));
                        material.SetTextureScale("_BaseMap", original.GetTextureScale("_BaseMap"));
                        material.SetTextureOffset("_BaseMap", original.GetTextureOffset("_BaseMap"));
                    }
                }
                result[i] = material;
            }
            return result;
        }

        private static void SetPlane(Material[] materials, Vector4 plane)
        {
            foreach (var material in materials) material.SetVector(ClipPlane, plane);
        }

        private static void RestoreTraveller(Traveller traveller)
        {
            if (traveller.source != null) traveller.source.sharedMaterials = traveller.originals;
            if (traveller.ghost != null) traveller.ghost.SetActive(false);
        }

        private void OnDisable() => ResetVisuals();

        public void ResetVisuals()
        {
            foreach (var traveller in travellers) RestoreTraveller(traveller);
            ActiveGhostCount = 0;
        }

        private void OnDestroy() => Dispose();
        public void Dispose() => ReleaseResources();

        private void ReleaseResources()
        {
            foreach (var traveller in travellers)
            {
                RestoreTraveller(traveller);
                DestroyOwned(traveller.ghost);
                if (traveller.clipped != null) foreach (var material in traveller.clipped) DestroyOwned(material);
                if (traveller.ghostMaterials != null) foreach (var material in traveller.ghostMaterials) DestroyOwned(material);
            }
            travellers.Clear(); portals.Clear(); roomPortals.Clear(); rooms.Clear(); ActiveGhostCount = 0;
        }

        private static void DestroyOwned(UnityEngine.Object value)
        {
            if (value == null) return;
            if (Application.isPlaying) Destroy(value); else DestroyImmediate(value);
        }
    }
}
