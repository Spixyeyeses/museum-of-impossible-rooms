using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace Museum.Editor
{
    public static class MuseumPlayableBuilder
    {
        public const string ScenePath = "Assets/Museum/Scenes/MuseumPlayable.unity";

        [MenuItem("Museum/Create Playable Scene")]
        public static void CreateScene()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) throw new InvalidOperationException("Stop Play mode first.");
            if (File.Exists(ScenePath)) { Debug.Log("The playable scene already exists. Use Museum > Open Playable Scene."); return; }
            var previous = SceneManager.GetActiveScene();
            if (Enumerable.Range(0, SceneManager.sceneCount).Select(SceneManager.GetSceneAt).Any(s => s.isLoaded && string.IsNullOrEmpty(s.path)))
                throw new InvalidOperationException("Save the untitled scene before creating the playable scene. Your open scenes have been left untouched.");
            if (!File.Exists(MuseumWorldImporter.PrefabPath)) MuseumWorldImporter.Import();
            var content = AssetDatabase.LoadAssetAtPath<TextAsset>(MuseumWorldImporter.ContentPath);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(MuseumWorldImporter.PrefabPath);
            var shader = Shader.Find("Museum/PortalView");
            if (content == null || prefab == null || shader == null) throw new InvalidOperationException("Import the campaign and compile the portal shader first.");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            try
            {
                SceneManager.SetActiveScene(scene);
                var root = new GameObject("Museum");
                var runtime = root.AddComponent<MuseumPlayable>();
                runtime.campaignContent = content; runtime.layoutPrefab = prefab; runtime.portalShader = shader;
                runtime.travellerShader = Shader.Find("Museum/TravellerLit");
                var cameraObject = new GameObject("Visitor Camera"); cameraObject.transform.SetParent(root.transform, false);
                var camera = cameraObject.AddComponent<Camera>(); camera.tag = "MainCamera"; camera.fieldOfView = 70;
                camera.nearClipPlane = 0.035f; camera.farClipPlane = 160; camera.allowHDR = true;
                camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = new Color(0.035f, 0.055f, 0.075f);
                cameraObject.AddComponent<AudioListener>();
                var cameraData = cameraObject.AddComponent<UniversalAdditionalCameraData>();
                cameraData.renderPostProcessing = false; cameraData.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
                runtime.playerCamera = camera;
                var sunlight = new GameObject("Courtyard daylight");
                sunlight.transform.rotation = Quaternion.Euler(55, -30, 0);
                var light = sunlight.AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 0.75f;
                light.color = new Color(1, 0.91f, 0.77f); light.shadows = LightShadows.Soft;
                RenderSettings.ambientMode = AmbientMode.Flat; RenderSettings.ambientLight = new Color(0.19f, 0.23f, 0.28f);
                if (!EditorSceneManager.SaveScene(scene, ScenePath)) throw new IOException("Could not save the playable scene.");
                // Keep previous scene entries, but make the native museum the normal player build.
                var entries = EditorBuildSettings.scenes.Where(entry => entry.path != ScenePath)
                    .Select(entry => new EditorBuildSettingsScene(entry.path, false));
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) }.Concat(entries).ToArray();
                Debug.Log("Playable museum scene created. Open it, press Play, then Continue visit.");
            }
            finally
            {
                EditorSceneManager.CloseScene(scene, true);
                if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
            }
        }

        [MenuItem("Museum/Open Playable Scene")]
        public static void OpenScene()
        {
            if (!File.Exists(ScenePath)) CreateScene();
            // Avoid duplicate cameras and duplicate copies of rooms when starting Play mode.
            // Dirty scenes require Unity's normal save prompt; automation can use additive inspection instead.
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }

        [MenuItem("Museum/Build Windows Player")]
        public static void BuildWindows()
        {
            if (!File.Exists(ScenePath)) CreateScene();
            var output = Path.GetFullPath("Builds/Windows/Museum of Impossible Rooms.exe");
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath }, locationPathName = output, target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.DetailedBuildReport
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new InvalidOperationException("Windows build failed. See the Unity Console.");
            Debug.Log("Windows player created: " + output);
        }
    }
}
