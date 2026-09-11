using System;
using System.IO;
using System.Linq;
using Museum.Simulation;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Museum
{
    /// <summary>Opt-in image checks of paired views, including the frames immediately around a crossing.</summary>
    public static class MuseumVisualAudit
    {
        public static JObject Capture(MuseumPlayable playable, string directory, bool angled = false)
        {
            Directory.CreateDirectory(directory);
            var report = new JObject { ["unityVersion"] = Application.unityVersion, ["gpu"] = SystemInfo.graphicsDeviceName, ["angled"] = angled };
            var routes = new JArray(); report["routes"] = routes;
            var camera = playable.playerCamera;
            var oldTarget = camera.targetTexture; float oldAspect = camera.aspect;
            var target = new RenderTexture(960, 600, 24, RenderTextureFormat.ARGBHalf, RenderTextureReadWrite.Linear);
            var descriptor = target.descriptor; descriptor.msaaSamples = 4;
            target.antiAliasing = SystemInfo.GetRenderTextureSupportedMSAASampleCount(descriptor);
            var readback = new Texture2D(960, 600, TextureFormat.RGBAFloat, false, true);
            target.Create(); camera.targetTexture = target; camera.aspect = 1.6f;
            try
            {
                foreach (string id in new[] { "c1-east", "c1-gallery-in", "quarter-in", "quarter-out", "wall6-in", "wall6-out" })
                {
                    var portal = playable.Simulation.World.Portals[id];
                    float scale = portal.Height / 3.6f;
                    var route = new JObject { ["portal"] = id }; routes.Add(route);
                    var frames = new JArray(); route["frames"] = frames;
                    Color[] beforeCrossing = null;
                    float[] distances = { .2f, .05f, .01f, .001f, -.001f, -.01f, -.05f, -.2f };
                    for (int i = 0; i < distances.Length; i++)
                    {
                        playable.BeginVisit(portal.Room); playable.SetMenuVisible(true);
                        var simulation = playable.Simulation; var player = simulation.State.Player;
                        player.Scale = scale; player.Up = portal.Up;
                        player.Forward = (-portal.Normal + (angled ? portal.Right * .35f - portal.Up * .25f : Vector3.zero)).normalized;
                        player.Position = portal.Center - portal.Up * (.2f * scale) + portal.Normal * (distances[i] * scale)
                            + (angled ? portal.Right * (portal.Width * .22f) : Vector3.zero);
                        player.Velocity = Vector3.zero;
                        if (distances[i] < 0 && !simulation.CrossPortal(id)) throw new InvalidOperationException("Audit crossing failed: " + id);
                        playable.RefreshPresentation(); playable.TravellerRenderer.UpdateTravellers(); playable.PortalRenderer.RenderPortals();
                        var request = new UniversalRenderPipeline.SingleCameraRequest { destination = target };
                        RenderPipeline.SubmitRenderRequest(camera, request);
                        var previous = RenderTexture.active;
                        try { RenderTexture.active = target; readback.ReadPixels(new Rect(0, 0, 960, 600), 0, 0, false); readback.Apply(); }
                        finally { RenderTexture.active = previous; }
                        var colors = readback.GetPixels();
                        // Compare the middle of the image: excludes changing frame silhouettes near screen borders.
                        double luma = 0, difference = 0; int count = 0;
                        for (int y = 120; y < 480; y++) for (int x = 192; x < 768; x++)
                        {
                            int index = y * 960 + x; var c = colors[index];
                            luma += .2126 * c.r + .7152 * c.g + .0722 * c.b;
                            if (beforeCrossing != null) { var b = beforeCrossing[index]; difference += (Math.Abs(c.r - b.r) + Math.Abs(c.g - b.g) + Math.Abs(c.b - b.b)) / 3; }
                            count++;
                        }
                        if (i == 3) beforeCrossing = colors;
                        var frame = new JObject { ["distanceInVisitorMeters"] = distances[i], ["room"] = player.Room,
                            ["nearClip"] = camera.nearClipPlane, ["views"] = playable.PortalRenderer.LastViewCount, ["meanLinearLuminance"] = luma / count };
                        if (i == 4) route["crossingMeanAbsoluteRgbDifference"] = difference / count;
                        frames.Add(frame);
                        if (i == 0 || i == 3 || i == 4 || i == 7) SavePng(colors, 960, 600, Path.Combine(directory, id + "-" + i + ".png"));
                    }
                }
                File.WriteAllText(Path.Combine(directory, "report.json"), report.ToString() + "\n");
                return report;
            }
            finally
            {
                camera.targetTexture = oldTarget; camera.aspect = oldAspect;
                target.Release(); UnityEngine.Object.Destroy(target); UnityEngine.Object.Destroy(readback);
                playable.BeginVisit("c1"); playable.SetMenuVisible(true);
            }
        }

        private static void SavePng(Color[] linear, int width, int height, string path)
        {
            var png = new Texture2D(width, height, TextureFormat.RGB24, false, false);
            try
            {
                var colors = new Color32[linear.Length];
                for (int i = 0; i < colors.Length; i++) colors[i] = QualitySettings.activeColorSpace == ColorSpace.Linear ? linear[i].gamma : linear[i];
                png.SetPixels32(colors); png.Apply(); File.WriteAllBytes(path, png.EncodeToPNG());
            }
            finally { UnityEngine.Object.Destroy(png); }
        }
    }
}
