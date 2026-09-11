using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Museum
{
    /// <summary>
    /// Bounded, live room views for URP. Captures are submitted in LateUpdate, outside SRP callbacks,
    /// so rendering a disabled portal camera never recursively invokes this component.
    /// </summary>
    [DefaultExecutionOrder(10000)]
    public sealed class MuseumPortalRenderer : MonoBehaviour, IDisposable
    {
        [Tooltip("Keep a serialized shader reference in the player scene to prevent build stripping.")]
        public Shader portalShader;
        [Range(1, 4)] public int recursionDepth = 2;
        [Range(1, 24)] public int maxPortalViews = 12;
        [Range(0.25f, 1)] public float resolutionScale = 1f;
        [Range(256, 2560)] public int maximumTextureWidth = 1920;
        public int LastViewCount { get; private set; }
        public bool RenderingAvailable { get; private set; }
        public string CurrentRoom => currentRoom;

        private sealed class Portal
        {
            public MuseumAnchor anchor;
            public float width, height;
            public bool hideInactive;
            public Renderer surface;
            public Material material;
            public Mesh mesh;
        }

        private sealed class View
        {
            public Camera camera;
            public RenderTexture texture;
            public UniversalRenderPipeline.SingleCameraRequest request = new UniversalRenderPipeline.SingleCameraRequest();
        }

        private struct RendererState { public Renderer renderer; public string room; public bool forcedOff; }
        private struct LightState { public Light light; public string room; public bool enabled; }
        private struct SurfaceState { public Portal portal; public Texture texture; public float live, depthClip; public bool enabled; }
        private readonly Dictionary<string, MuseumAnchor> rooms = new Dictionary<string, MuseumAnchor>();
        private readonly Dictionary<string, Portal> portals = new Dictionary<string, Portal>();
        private readonly Dictionary<string, List<Portal>> roomPortals = new Dictionary<string, List<Portal>>();
        private readonly List<RendererState> renderers = new List<RendererState>();
        private readonly List<LightState> lights = new List<LightState>();
        private readonly HashSet<string> outdoorRooms = new HashSet<string>();
        private readonly List<View> views = new List<View>();
        private readonly List<GameObject> generated = new List<GameObject>();
        private Camera playerCamera;
        private string currentRoom;
        private Func<string, bool> isOpen;
        private bool rendering;
        private int rootReserve;
        private readonly UniversalRenderPipeline.SingleCameraRequest supportRequest = new UniversalRenderPipeline.SingleCameraRequest();
        private static readonly int ViewTexture = Shader.PropertyToID("_PortalView");
        private static readonly int Live = Shader.PropertyToID("_Live");
        private static readonly int DepthClip = Shader.PropertyToID("_DepthClip");

        /// <param name="portalAnchors">Aperture forward points inward; sourceJson supplies width and height.</param>
        public void Initialize(Camera camera, MuseumAnchor[] roomAnchors, MuseumAnchor[] portalAnchors)
        {
            if (camera == null) throw new ArgumentNullException(nameof(camera));
            ReleaseResources();
            playerCamera = camera;
            portalShader = portalShader != null ? portalShader : Shader.Find("Museum/PortalView");
            if (portalShader == null) throw new InvalidOperationException("Museum/PortalView shader is missing from this player.");
            foreach (var room in roomAnchors)
            {
                if (room == null || room.kind != "room") continue;
                rooms.Add(room.sourceId, room);
                roomPortals.Add(room.sourceId, new List<Portal>());
                if (!string.IsNullOrEmpty(room.sourceJson) && (bool?)JObject.Parse(room.sourceJson)["openSky"] == true) outdoorRooms.Add(room.sourceId);
                foreach (var light in room.GetComponentsInChildren<Light>(true))
                    lights.Add(new LightState { light = light, room = room.sourceId, enabled = light.enabled });
            }
            // The preview's directional daylight belongs to open courtyards. Room lights must follow
            // the rendered room too: hidden architecture alone does not stop lights leaking between rooms.
            foreach (var light in UnityEngine.Object.FindObjectsByType<Light>())
                if (light.type == LightType.Directional && light.gameObject.scene == camera.gameObject.scene)
                    lights.Add(new LightState { light = light, room = null, enabled = light.enabled });
            foreach (var anchor in portalAnchors)
            {
                if (anchor == null || anchor.kind != "portal") continue;
                var data = JObject.Parse(anchor.sourceJson);
                var portal = new Portal { anchor = anchor, width = (float)data["width"], height = (float)data["height"],
                    hideInactive = (bool?)data["hideInactive"] == true };
                MuseumPortalMath.Scale(portal.height, portal.height);
                if (portal.width <= 0) throw new InvalidOperationException("Invalid portal width: " + anchor.sourceId);
                var surface = new GameObject("Live portal view");
                surface.transform.SetParent(anchor.transform, false);
                portal.mesh = CreateAperture(portal.width, portal.height);
                surface.AddComponent<MeshFilter>().sharedMesh = portal.mesh;
                portal.surface = surface.AddComponent<MeshRenderer>();
                portal.material = new Material(portalShader) { name = "Portal view " + anchor.sourceId };
                portal.material.SetColor("_ClosedColor", new Color(0.025f, 0.05f, 0.055f, 1));
                portal.surface.sharedMaterial = portal.material;
                portal.surface.shadowCastingMode = ShadowCastingMode.Off;
                portal.surface.receiveShadows = false;
                portal.surface.lightProbeUsage = LightProbeUsage.Off;
                portal.surface.reflectionProbeUsage = ReflectionProbeUsage.Off;
                generated.Add(surface);
                portals.Add(anchor.sourceId, portal);
                roomPortals[anchor.roomId].Add(portal);
            }
            RefreshRoomRenderers();
        }

        /// <summary>The predicate receives portal IDs. Both source and destination must be open.</summary>
        public void SetState(string room, Func<string, bool> portalIsOpen)
        {
            currentRoom = room;
            isOpen = portalIsOpen;
        }

        /// <summary>Called automatically each frame; also available immediately after geometry is reparented.</summary>
        public void RefreshRoomRenderers()
        {
            RestoreRoomVisibility();
            renderers.Clear();
            foreach (var room in rooms)
                if (room.Value != null)
                    foreach (var renderer in room.Value.GetComponentsInChildren<Renderer>(true))
                        renderers.Add(new RendererState { renderer = renderer, room = room.Key, forcedOff = renderer.forceRenderingOff });
        }

        private bool Open(Portal portal) => portals.TryGetValue(portal.anchor.destinationId ?? "", out var destination)
            && (isOpen != null ? isOpen(portal.anchor.sourceId) && isOpen(destination.anchor.sourceId)
                : portal.anchor.initiallyAvailable && destination.anchor.initiallyAvailable);

        private void LateUpdate() => RenderPortals();

        public void RenderPortals()
        {
            if (rendering || playerCamera == null || string.IsNullOrEmpty(currentRoom) || !rooms.ContainsKey(currentRoom)) return;
            rendering = true;
            try
            {
                RefreshRoomRenderers();
                StabilizeNearPlane();
                LastViewCount = 0;
                RenderingAvailable = RenderPipeline.SupportsRenderRequest(playerCamera, supportRequest);
                rootReserve = VisiblePortals(currentRoom, playerCamera, null).Count;
                RenderView(currentRoom, playerCamera, null, 0, null);
            }
            finally
            {
                SetRoomVisibility(currentRoom);
                rendering = false;
            }
        }

        private void StabilizeNearPlane()
        {
            foreach (var portal in roomPortals[currentRoom])
            {
                if (!Open(portal)) continue;
                var t = portal.anchor.transform;
                Vector3 eye = Quaternion.Inverse(t.rotation) * (playerCamera.transform.position - t.position);
                if (Mathf.Abs(eye.x) > portal.width / 2 || Mathf.Abs(eye.y) > portal.height / 2) continue;
                float minimum = Mathf.Max(0.00001f, portal.height * 0.00004f);
                if (Mathf.Abs(eye.z) < minimum)
                {
                    playerCamera.transform.position += t.forward * (minimum - eye.z);
                    eye.z = minimum;
                }
                // The portal shader clamps its player-facing surface at the stable camera near plane.
                // Never reduce the room camera's depth precision to keep this one surface visible.
            }
        }

        private List<Portal> VisiblePortals(string room, Camera camera, string skip)
        {
            var visible = new List<Portal>();
            if (!roomPortals.TryGetValue(room, out var entries)) return visible;
            Plane[] frustum = GeometryUtility.CalculateFrustumPlanes(camera);
            foreach (var portal in entries)
            {
                if (portal.anchor.sourceId == skip || !Open(portal)) continue;
                var t = portal.anchor.transform;
                if (Vector3.Dot(camera.transform.position - t.position, t.forward) < -0.00001f) continue;
                // Test the whole aperture, including grazing and exactly-on-plane views.
                var bounds = portal.surface.bounds;
                bounds.Expand(0.005f);
                if (GeometryUtility.TestPlanesAABB(frustum, bounds)) visible.Add(portal);
            }
            visible.Sort((a, b) => Vector3.SqrMagnitude(camera.transform.position - a.anchor.transform.position)
                .CompareTo(Vector3.SqrMagnitude(camera.transform.position - b.anchor.transform.position)));
            return visible;
        }

        private void RenderView(string room, Camera camera, View destinationView, int depth, string skip)
        {
            var saved = new List<SurfaceState>();
            try
            {
                foreach (var portal in roomPortals[room])
                {
                    saved.Add(new SurfaceState { portal = portal, texture = portal.material.GetTexture(ViewTexture),
                        live = portal.material.GetFloat(Live), depthClip = portal.material.GetFloat(DepthClip), enabled = portal.surface.enabled });
                    portal.material.SetFloat(Live, 0);
                    portal.material.SetFloat(DepthClip, depth == 0 ? 0 : 1);
                    portal.surface.enabled = portal.anchor.sourceId != skip && (!portal.hideInactive || Open(portal));
                }
                var visible = VisiblePortals(room, camera, skip);
                foreach (var portal in visible)
                {
                    if (depth == 0) rootReserve = Mathf.Max(0, rootReserve - 1);
                    if (!RenderingAvailable || depth >= recursionDepth || LastViewCount >= maxPortalViews - (depth == 0 ? 0 : rootReserve)) continue;
                    var paired = portals[portal.anchor.destinationId];
                    var view = GetView(LastViewCount++, depth);
                    MuseumPortalMath.ConfigureCamera(camera, view.camera, portal.anchor.transform, paired.anchor.transform,
                        portal.height, paired.height);
                    ConfigureUrpCamera(view.camera);
                    RenderView(paired.anchor.roomId, view.camera, view, depth + 1, paired.anchor.sourceId);
                    portal.material.SetTexture(ViewTexture, view.texture);
                    portal.material.SetFloat(Live, 1);
                }
                SetRoomVisibility(room);
                if (destinationView != null)
                {
                    destinationView.request.destination = destinationView.texture;
                    RenderPipeline.SubmitRenderRequest(camera, destinationView.request);
                }
            }
            finally
            {
                // The root's surface assignments are consumed by the normal player-camera render later this frame.
                if (destinationView != null)
                    foreach (var state in saved)
                    {
                        state.portal.material.SetTexture(ViewTexture, state.texture);
                        state.portal.material.SetFloat(Live, state.live);
                        state.portal.material.SetFloat(DepthClip, state.depthClip);
                        state.portal.surface.enabled = state.enabled;
                    }
            }
        }

        private View GetView(int slot, int depth)
        {
            while (views.Count <= slot)
            {
                var go = new GameObject("Museum portal camera " + views.Count) { hideFlags = HideFlags.HideAndDontSave };
                var camera = go.AddComponent<Camera>();
                camera.enabled = false;
                camera.gameObject.AddComponent<UniversalAdditionalCameraData>();
                views.Add(new View { camera = camera });
            }
            var view = views[slot];
            float factor = resolutionScale * Mathf.Pow(0.75f, depth);
            int width = Mathf.Max(64, Mathf.Min(maximumTextureWidth, Mathf.RoundToInt(playerCamera.pixelWidth * factor)));
            int height = Mathf.Max(64, Mathf.RoundToInt(width / Mathf.Max(0.1f, playerCamera.aspect)));
            var format = SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBHalf) ? RenderTextureFormat.ARGBHalf : RenderTextureFormat.ARGB32;
            var descriptor = new RenderTextureDescriptor(width, height, format, 24) { msaaSamples = 4 };
            int samples = SystemInfo.GetRenderTextureSupportedMSAASampleCount(descriptor);
            if (view.texture == null || view.texture.width != width || view.texture.height != height || view.texture.antiAliasing != samples)
            {
                ReleaseTexture(view.texture);
                view.texture = new RenderTexture(width, height, 24, format, RenderTextureReadWrite.Linear)
                {
                    name = "Museum portal view " + slot, filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp,
                    useMipMap = false, autoGenerateMips = false, antiAliasing = samples, hideFlags = HideFlags.HideAndDontSave
                };
                view.texture.Create();
            }
            return view;
        }

        private static void ConfigureUrpCamera(Camera camera)
        {
            camera.allowHDR = true;
            camera.allowMSAA = true;
            var data = camera.GetUniversalAdditionalCameraData();
            data.renderType = CameraRenderType.Base;
            data.renderPostProcessing = false; // Tone mapping applies once, in the final player view.
            data.antialiasing = AntialiasingMode.None;
            data.requiresColorOption = CameraOverrideOption.Off;
            data.requiresDepthOption = CameraOverrideOption.Off;
            data.allowXRRendering = false;
            data.renderShadows = true;
        }

        private void SetRoomVisibility(string room)
        {
            foreach (var state in renderers)
                if (state.renderer != null) state.renderer.forceRenderingOff = state.forcedOff || state.room != room;
            foreach (var state in lights)
                if (state.light != null) state.light.enabled = state.enabled && (state.room == null ? outdoorRooms.Contains(room) : state.room == room);
        }

        private void RestoreRoomVisibility()
        {
            foreach (var state in renderers)
                if (state.renderer != null) state.renderer.forceRenderingOff = state.forcedOff;
            foreach (var state in lights)
                if (state.light != null) state.light.enabled = state.enabled;
        }

        private static Mesh CreateAperture(float width, float height)
        {
            var mesh = new Mesh { name = "Portal aperture (no collision)" };
            mesh.vertices = new[] { new Vector3(-width / 2, -height / 2, 0), new Vector3(width / 2, -height / 2, 0),
                new Vector3(-width / 2, height / 2, 0), new Vector3(width / 2, height / 2, 0) };
            mesh.triangles = new[] { 0, 1, 2, 2, 1, 3 };
            // The shader keeps a close aperture on the near plane; CPU frustum culling must also
            // retain it when its original zero-thickness quad is closer than that plane.
            mesh.bounds = new Bounds(Vector3.zero, new Vector3(width, height, Mathf.Max(0.2f, height * 0.2f)));
            return mesh;
        }

        private void OnDisable() => RestoreRoomVisibility();
        private void OnDestroy() => Dispose();
        /// <summary>Explicit cleanup also supports instances initialized by Editor tooling without a runtime lifecycle.</summary>
        public void Dispose() => ReleaseResources();

        private void ReleaseResources()
        {
            RestoreRoomVisibility();
            foreach (var view in views)
            {
                ReleaseTexture(view.texture);
                if (view.camera != null) DestroyOwned(view.camera.gameObject);
            }
            foreach (var portal in portals.Values)
            {
                DestroyOwned(portal.material);
                DestroyOwned(portal.mesh);
            }
            foreach (var go in generated) if (go != null) { go.SetActive(false); DestroyOwned(go); }
            views.Clear(); generated.Clear(); portals.Clear(); rooms.Clear(); roomPortals.Clear(); renderers.Clear(); lights.Clear(); outdoorRooms.Clear();
            LastViewCount = 0;
            RenderingAvailable = false;
        }

        private static void ReleaseTexture(RenderTexture texture)
        {
            if (texture == null) return;
            texture.Release();
            DestroyOwned(texture);
        }

        private static void DestroyOwned(UnityEngine.Object value)
        {
            if (value == null) return;
            if (Application.isPlaying) Destroy(value); else DestroyImmediate(value);
        }
    }
}
