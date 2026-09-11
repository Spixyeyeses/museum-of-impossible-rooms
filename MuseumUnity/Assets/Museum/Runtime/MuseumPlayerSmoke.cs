using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Museum
{
    /// <summary>Opt-in packaged-player verification. Normal visits never create this component.</summary>
    public sealed class MuseumPlayerSmoke : MonoBehaviour
    {
        private const string Argument = "--museum-smoke-test";
        private const string VisualArgument = "--museum-visual-audit";

        [Serializable]
        private sealed class SmokeReport
        {
            public bool success;
            public string unityVersion = "";
            public string gpu = "";
            public int rooms27;
            public int activePortalViews;
            public bool renderingAvailable;
            public bool portalShaderSupported;
            public bool travellerShaderSupported;
            public bool portalTextureCreated;
            public float[] pixelRangeRGB = new float[3];
            public string error = "";
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void StartWhenRequested()
        {
            if (!Environment.GetCommandLineArgs().Any(value => string.Equals(value, Argument, StringComparison.Ordinal) || string.Equals(value, VisualArgument, StringComparison.Ordinal))) return;
            var runner = new GameObject("Packaged player smoke check") { hideFlags = HideFlags.DontSave };
            DontDestroyOnLoad(runner);
            runner.AddComponent<MuseumPlayerSmoke>();
        }

        private IEnumerator Start()
        {
            var report = new SmokeReport { unityVersion = Application.unityVersion, gpu = SystemInfo.graphicsDeviceName };
            MuseumPlayable playable = null;
            string outputDirectory = null;
            try { outputDirectory = Directory.GetParent(Application.dataPath)?.FullName; }
            catch (Exception error) { report.error = SafeError("Finding the build output directory", error); }
            if (string.IsNullOrEmpty(outputDirectory))
            {
                if (string.IsNullOrEmpty(report.error)) report.error = "The build output directory is unavailable.";
                Complete(report, outputDirectory);
                yield break;
            }

            for (int frame = 0; frame < 120; frame++)
            {
                playable = FindAnyObjectByType<MuseumPlayable>();
                if (playable != null && playable.Simulation != null && playable.PortalRenderer != null && playable.playerCamera != null) break;
                // WaitForEndOfFrame is intentionally avoided: it need not resume in batch mode.
                yield return null;
            }
            if (playable == null || playable.Simulation == null || playable.PortalRenderer == null || playable.playerCamera == null)
            {
                report.error = "The playable controller did not initialize within 120 frames.";
                Complete(report, outputDirectory);
                yield break;
            }

            bool prepared = false;
            try
            {
                playable.BeginVisit("c1");
                playable.SetMenuVisible(true);
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = false;
                var player = playable.Simulation.State.Player;
                player.Position = new Vector3(4.2f, 1.6f, 0.8f);
                player.Forward = new Vector3(1, -0.2f, 0.1f).normalized;
                player.Up = Vector3.up;
                player.Velocity = Vector3.zero;
                playable.RefreshPresentation();
                prepared = true;
            }
            catch (Exception error) { report.error = SafeError("Preparing the source-room camera", error); }
            if (!prepared)
            {
                Complete(report, outputDirectory);
                yield break;
            }

            for (int frame = 0; frame < 3; frame++) yield return null;
            try
            {
                Capture(playable, report, outputDirectory);
                if (Environment.GetCommandLineArgs().Contains(VisualArgument))
                {
                    foreach (bool angled in new[] { false, true })
                    {
                        var audit = MuseumVisualAudit.Capture(playable, Path.Combine(outputDirectory, "visual-audit" + (angled ? "-angled" : "")), angled);
                        bool stable = audit["routes"].All(route => (double)route["crossingMeanAbsoluteRgbDifference"] < 0.012
                            && route["frames"].All(frame => (double)frame["meanLinearLuminance"] > 0.008));
                        report.success &= stable;
                        if (!stable) report.error += " A portal crossing failed the visual continuity check.";
                    }
                }
            }
            catch (Exception error) { report.success = false; report.error = SafeError("Capturing packaged-player rendering", error); }
            Complete(report, outputDirectory);
        }

        private static void Capture(MuseumPlayable playable, SmokeReport report, string outputDirectory)
        {
            var camera = playable.playerCamera;
            var previousTarget = camera.targetTexture;
            var previousAspect = camera.aspect;
            var view = new RenderTexture(1440, 900, 24, RenderTextureFormat.ARGB32)
            {
                name = "Packaged player smoke view", antiAliasing = 1, hideFlags = HideFlags.DontSave
            };
            var descriptor = view.descriptor; descriptor.msaaSamples = 4;
            view.antiAliasing = SystemInfo.GetRenderTextureSupportedMSAASampleCount(descriptor);
            try
            {
                view.Create();
                camera.targetTexture = view;
                camera.aspect = 1440f / 900f;
                playable.RefreshPresentation();
                // Camera dimensions and aspect must be final before allocating and rendering portal views.
                playable.PortalRenderer.RenderPortals();

                report.rooms27 = playable.GetComponentsInChildren<MuseumAnchor>(true).Count(anchor => anchor.kind == "room");
                report.activePortalViews = playable.PortalRenderer.LastViewCount;
                report.renderingAvailable = playable.PortalRenderer.RenderingAvailable;
                var portalShader = playable.portalShader != null ? playable.portalShader : Shader.Find("Museum/PortalView");
                var travellerShader = playable.travellerShader != null ? playable.travellerShader : Shader.Find("Museum/TravellerLit");
                report.portalShaderSupported = portalShader != null && portalShader.isSupported;
                report.travellerShaderSupported = travellerShader != null && travellerShader.isSupported;

                var anchor = playable.GetComponentsInChildren<MuseumAnchor>(true)
                    .FirstOrDefault(item => item.kind == "portal" && item.sourceId == "c1-east");
                var surface = anchor != null ? anchor.transform.Find("Live portal view") : null;
                var material = surface != null ? surface.GetComponent<Renderer>()?.sharedMaterial : null;
                var portalTexture = material != null ? material.GetTexture("_PortalView") as RenderTexture : null;
                report.portalTextureCreated = portalTexture != null && portalTexture.IsCreated();
                if (report.portalTextureCreated)
                    report.pixelRangeRGB = SavePngAndMeasure(portalTexture, Path.Combine(outputDirectory, "smoke-portal.png"));

                var request = new UniversalRenderPipeline.SingleCameraRequest { destination = view };
                if (view.IsCreated() && RenderPipeline.SupportsRenderRequest(camera, request))
                {
                    RenderPipeline.SubmitRenderRequest(camera, request);
                    SavePngAndMeasure(view, Path.Combine(outputDirectory, "smoke-view.png"));
                }

                var failures = new List<string>();
                if (report.rooms27 != 27) failures.Add("The expected 27 room anchors were not instantiated.");
                if (!report.renderingAvailable) failures.Add("The active pipeline cannot submit portal camera requests.");
                if (report.activePortalViews <= 0) failures.Add("No destination portal views were rendered.");
                if (!report.portalShaderSupported) failures.Add("The packaged portal shader is missing or unsupported.");
                if (!report.travellerShaderSupported) failures.Add("The packaged traveller shader is missing or unsupported.");
                if (!report.portalTextureCreated) failures.Add("The east doorway has no created render texture.");
                if (!report.pixelRangeRGB.Any(range => range > 0.02f)) failures.Add("The portal image is constant or has insufficient RGB variation.");
                report.success = failures.Count == 0;
                report.error = string.Join(" ", failures);
            }
            finally
            {
                camera.targetTexture = previousTarget;
                camera.aspect = previousAspect;
                view.Release();
                Destroy(view);
            }
        }

        private static float[] SavePngAndMeasure(RenderTexture source, string path)
        {
            var previous = RenderTexture.active;
            var previousSrgbWrite = GL.sRGBWrite;
            Texture2D pixels = null;
            Texture2D png = null;
            RenderTexture readable = null;
            try
            {
                // Resolve MSAA without quantizing linear dark tones to 8-bit before display encoding.
                // That early quantization creates visible banding that is absent in the player image.
                readable = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.ARGBHalf, RenderTextureReadWrite.Linear);
                GL.sRGBWrite = false;
                Graphics.Blit(source, readable);
                GL.sRGBWrite = previousSrgbWrite;
                RenderTexture.active = readable;
                pixels = new Texture2D(source.width, source.height, TextureFormat.RGBAFloat, false, true);
                pixels.ReadPixels(new Rect(0, 0, source.width, source.height), 0, 0, false);
                pixels.Apply(false, false);
                var minimum = new[] { 1f, 1f, 1f };
                var maximum = new[] { 0f, 0f, 0f };
                var colors = pixels.GetPixels();
                var encoded = new Color32[colors.Length];
                bool encodeSrgb = QualitySettings.activeColorSpace == ColorSpace.Linear;
                for (int index = 0; index < colors.Length; index++)
                {
                    var color = colors[index];
                    minimum[0] = Mathf.Min(minimum[0], Mathf.Clamp01(color.r)); maximum[0] = Mathf.Max(maximum[0], Mathf.Clamp01(color.r));
                    minimum[1] = Mathf.Min(minimum[1], Mathf.Clamp01(color.g)); maximum[1] = Mathf.Max(maximum[1], Mathf.Clamp01(color.g));
                    minimum[2] = Mathf.Min(minimum[2], Mathf.Clamp01(color.b)); maximum[2] = Mathf.Max(maximum[2], Mathf.Clamp01(color.b));
                    // Measure the original linear readback first. EncodeToPNG writes raw bytes and
                    // does not apply a display transfer function, so encode RGB for PNG viewers here.
                    encoded[index] = encodeSrgb ? color.gamma : color;
                }
                png = new Texture2D(source.width, source.height, TextureFormat.RGB24, false, false);
                png.SetPixels32(encoded); png.Apply(false, false);
                File.WriteAllBytes(path, png.EncodeToPNG());
                return new[] { maximum[0] - minimum[0], maximum[1] - minimum[1], maximum[2] - minimum[2] };
            }
            finally
            {
                RenderTexture.active = previous;
                GL.sRGBWrite = previousSrgbWrite;
                if (pixels != null) Destroy(pixels);
                if (png != null) Destroy(png);
                if (readable != null) RenderTexture.ReleaseTemporary(readable);
            }
        }

        private static string SafeError(string stage, Exception error) => stage + " failed (" + error.GetType().Name + ").";

        private static void Complete(SmokeReport report, string outputDirectory)
        {
            if (!string.IsNullOrEmpty(outputDirectory))
            {
                try { File.WriteAllText(Path.Combine(outputDirectory, "smoke-report.json"), JsonUtility.ToJson(report, true) + "\n"); }
                catch (Exception error)
                {
                    report.success = false;
                    Debug.LogError(SafeError("Writing smoke-report.json", error));
                }
            }
            Debug.Log(report.success ? "Museum packaged-player smoke check passed." : "Museum packaged-player smoke check failed. " + report.error);
            Application.Quit(report.success ? 0 : 1);
        }
    }
}
