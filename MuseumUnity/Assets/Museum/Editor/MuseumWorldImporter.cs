using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace Museum.Editor
{
    /// <summary>One-way layout import. Generated content is replaceable; authored art belongs elsewhere.</summary>
    public static class MuseumWorldImporter
    {
        public const string ContentPath = "Assets/Museum/Content/world.v1.json";
        public const string GeneratedPath = "Assets/Museum/Generated";
        public const string PrefabPath = GeneratedPath + "/CampaignLayout.prefab";
        public const string ScenePath = "Assets/Museum/Scenes/CampaignPreview.unity";
        public const float RoomSpacing = 80f;
        private const float Epsilon = 0.0001f;

        [MenuItem("Museum/Import Campaign Layout")]
        public static void Import()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play mode before importing campaign content.");
            var document = ReadDocument(); // Validate before touching assets.
            EnsureFolder(GeneratedPath);
            EnsureFolder("Assets/Museum/Scenes");
            var previous = SceneManager.GetActiveScene();
            var temporary = EditorSceneManager.NewPreviewScene();
            GameObject root = null;
            try
            {
                root = BuildLayout(document, temporary);
                var prefab = PrefabUtility.SaveAsPrefabAsset(root, PrefabPath, out var success);
                if (!success) throw new IOException("Could not save campaign layout prefab.");
                // Only create the preview scene once. Reimports update its prefab, preserving scene edits.
                if (!File.Exists(ScenePath))
                {
                    // Unity refuses additive scene creation while any untitled scene is open.
                    // Finish the prefab import without saving or closing the user's scene.
                    bool untitled = Enumerable.Range(0, SceneManager.sceneCount)
                        .Select(SceneManager.GetSceneAt).Any(scene => scene.isLoaded && string.IsNullOrEmpty(scene.path));
                    if (untitled) Debug.LogWarning("Museum layout imported. Save the untitled scene, then use Museum > Open Campaign Preview to create the preview scene.");
                    else CreateScene(prefab, document, previous);
                }
            }
            finally
            {
                if (root != null) Object.DestroyImmediate(root);
                EditorSceneManager.ClosePreviewScene(temporary);
                if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
            }
            Debug.Log($"Museum: imported {document["world"]["rooms"].Count()} rooms and {document["world"]["portals"].Count()} portal anchors. Layout preview only; gameplay and portal views are not implemented.");
        }

        [MenuItem("Museum/Open Campaign Preview")]
        public static void OpenPreview()
        {
            if (!File.Exists(ScenePath)) Import();
            if (!File.Exists(ScenePath)) return;
            var scene = SceneManager.GetSceneByPath(ScenePath);
            if (!scene.IsValid() || !scene.isLoaded) scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Additive);
            SceneManager.SetActiveScene(scene);
            var camera = scene.GetRootGameObjects().SelectMany(root => root.GetComponentsInChildren<Camera>()).FirstOrDefault();
            if (camera != null && SceneView.lastActiveSceneView != null)
                SceneView.lastActiveSceneView.AlignViewToObject(camera.transform);
        }

        public static JObject ReadDocument()
        {
            if (!File.Exists(ContentPath)) throw new FileNotFoundException("Run npm run unity:export in the repository first.", ContentPath);
            var document = JObject.Parse(File.ReadAllText(ContentPath));
            ValidateDocument(document);
            return document;
        }

        public static void ValidateDocument(JObject document)
        {
            if ((int?)document["schemaVersion"] != 1 || (string)document["coordinates"]?["unityMapping"] != "reflect-z")
                throw new InvalidDataException("Unsupported museum schema or coordinate mapping. Re-export from the repository.");
            var world = document["world"] as JObject ?? throw new InvalidDataException("Missing world.");
            foreach (var name in new[] { "rooms", "portals", "objects", "interactables", "chapters" })
                if (!(world[name] is JArray)) throw new InvalidDataException($"Missing collection: {name}");
            foreach (var name in new[] { "rooms", "portals", "objects", "interactables" })
            {
                var ids = world[name].Select(item => (string)item["id"]).ToArray();
                if (ids.Any(string.IsNullOrWhiteSpace) || ids.Distinct().Count() != ids.Length)
                    throw new InvalidDataException($"Missing or duplicate ID in {name}.");
            }
            var rooms = new HashSet<string>(world["rooms"].Select(r => (string)r["id"]));
            var portals = world["portals"].ToDictionary(p => (string)p["id"]);
            if (!rooms.Contains((string)world["startRoom"])) throw new InvalidDataException("Unknown start room.");
            foreach (var collection in new[] { "portals", "objects", "interactables" })
                foreach (var item in world[collection])
                    if (!rooms.Contains((string)item["room"])) throw new InvalidDataException($"Unknown room for {item["id"]}.");
            foreach (var portal in portals.Values)
            {
                if (!portals.TryGetValue((string)portal["to"] ?? "", out var destination) || (string)destination["to"] != (string)portal["id"])
                    throw new InvalidDataException($"Broken reciprocal portal: {portal["id"]}");
                if (!((float?)portal["height"] > 0) || !((float?)portal["width"] > 0))
                    throw new InvalidDataException("Portal dimensions must be positive.");
            }
        }

        // Matches the browser's empty-flag starting state solely for this static preview.
        public static bool InitialCondition(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null) return true;
            if (token.Type == JTokenType.Boolean) return (bool)token;
            if (token.Type == JTokenType.String) return false;
            if (token is JArray array) return array.All(InitialCondition);
            if (token is JObject obj)
            {
                if (obj.ContainsKey("not")) return !InitialCondition(obj["not"]);
                if (obj["any"] is JArray any) return any.Any(InitialCondition);
                if (obj["all"] is JArray all) return all.All(InitialCondition);
            }
            return false;
        }

        public static GameObject BuildLayout(JObject document, Scene scene)
        {
            ValidateDocument(document);
            var root = new GameObject("Museum Campaign Layout (generated)");
            SceneManager.MoveGameObjectToScene(root, scene);
            try
            {
                var world = document["world"];
                var floor = Material("Floor", new Color(0.28f, 0.32f, 0.34f), 0.12f, 0.32f);
                var wall = Material("Wall", new Color(0.72f, 0.73f, 0.69f), 0, 0.2f);
                var brass = Material("Brass", new Color(0.65f, 0.45f, 0.20f), 0.65f, 0.5f);
                var locked = Material("Unavailable", new Color(0.20f, 0.24f, 0.29f), 0.15f, 0.25f);
                var weight = Material("Weight", new Color(0.36f, 0.70f, 0.67f), 0.35f, 0.4f);
                var glass = Material("Glass placeholder", new Color(0.36f, 0.61f, 0.72f, 0.22f), 0.1f, 0.85f, true);
                var portals = world["portals"].ToDictionary(p => (string)p["id"]);
                var roomIndex = 0;
                foreach (var room in world["rooms"])
                {
                    var id = (string)room["id"];
                    var roomRoot = Child(root.transform, $"{id} — {room["name"]}");
                    roomRoot.localPosition = new Vector3(roomIndex % 6 * RoomSpacing, 0, roomIndex / 6 * RoomSpacing);
                    roomIndex++;
                    Anchor(roomRoot, room, "room", id);
                    var roomPortals = portals.Values.Where(p => (string)p["room"] == id).ToArray();
                    var shell = Child(roomRoot, "Shell (cutaway roof)");
                    foreach (var box in ShellBoxes(room, roomPortals))
                        Cube(shell, box.name, MuseumCoordinates.ToUnity(box.center), box.size, box.floor ? floor : wall);
                    foreach (var solid in room["solids"] ?? new JArray())
                    {
                        var marker = Child(roomRoot, "Solid " + solid["id"]);
                        var anchor = Anchor(marker, solid, "solid", id);
                        anchor.initiallyAvailable = InitialCondition(solid["requires"]);
                        var min = Vector(solid["min"]); var max = Vector(solid["max"]);
                        marker.localPosition = MuseumCoordinates.ToUnity((min + max) * 0.5f);
                        if (anchor.initiallyAvailable && (bool?)solid["invisible"] != true)
                            Cube(marker, "Geometry", Vector3.zero, max - min, (string)solid["material"] == "glass" ? glass : wall);
                    }
                    foreach (var portal in roomPortals)
                    {
                        var marker = Child(roomRoot, "Portal " + portal["id"]);
                        marker.localPosition = MuseumCoordinates.ToUnity(Vector(portal["center"]));
                        marker.localRotation = MuseumCoordinates.Orientation(Vector(portal["normal"]), Vector(portal["up"]));
                        var anchor = Anchor(marker, portal, "portal", id);
                        anchor.destinationId = (string)portal["to"];
                        anchor.initiallyAvailable = InitialCondition(portal["requires"]) && InitialCondition(portals[anchor.destinationId]["requires"]);
                        // Alternate arrangements share apertures. Keep both anchors, show only the initial arrangement.
                        float width = (float)portal["width"], height = (float)portal["height"], trim = Mathf.Min(0.12f, width * 0.08f);
                        if (!anchor.initiallyAvailable && (bool?)portal["hideInactive"] == true)
                        {
                            var center = Vector(portal["center"]);
                            var normal = Vector(portal["normal"]);
                            bool replacement = roomPortals.Any(other => (string)other["id"] != anchor.sourceId
                                && InitialCondition(other["requires"]) && InitialCondition(portals[(string)other["to"]]["requires"])
                                && Vector3.Distance(Vector(other["center"]), center) < Epsilon
                                && Vector3.Dot(Vector(other["normal"]), normal) > 0.999f);
                            var min = Vector(room["bounds"]["min"]); var max = Vector(room["bounds"]["max"]);
                            bool boundary = Enumerable.Range(0, 3).Any(axis => Mathf.Abs(normal[axis]) > 0.999f
                                && (Mathf.Abs(center[axis] - min[axis]) < Epsilon || Mathf.Abs(center[axis] - max[axis]) < Epsilon));
                            if (!replacement && boundary) Cube(marker, "Hidden boundary", new Vector3(0, 0, -0.08f), new Vector3(width, height, 0.16f), wall);
                            continue;
                        }
                        var material = anchor.initiallyAvailable ? brass : locked;
                        Cube(marker, "Left jamb", new Vector3(-(width + trim) / 2, 0, 0), new Vector3(trim, height + trim * 2, trim * 2), material);
                        Cube(marker, "Right jamb", new Vector3((width + trim) / 2, 0, 0), new Vector3(trim, height + trim * 2, trim * 2), material);
                        Cube(marker, "Lintel", new Vector3(0, (height + trim) / 2, 0), new Vector3(width, trim, trim * 2), material);
                        // A flush top face competes with the room floor in the depth buffer. Keep a tiny,
                        // aperture-scaled reveal above it, including thresholds on wall-gravity floors.
                        float reveal = height * (0.006f / 3.6f);
                        Cube(marker, "Threshold", new Vector3(0, -(height + trim) / 2 + reveal, 0), new Vector3(width, trim, trim * 2), material);
                        if (!anchor.initiallyAvailable) Cube(marker, "Closed in initial state", Vector3.zero, new Vector3(width, height, 0.04f), locked);
                        Label(marker, "Label", ((string)portal["label"] ?? anchor.destinationId) + (anchor.initiallyAvailable ? "" : "\n[LOCKED]"), new Vector3(0, height / 2 + 0.35f, 0.04f), Mathf.Min(0.09f, width / 35), width * 1.05f);
                    }
                    foreach (var name in new[] { "objects", "interactables" })
                        foreach (var item in world[name].Where(item => (string)item["room"] == id))
                        {
                            var marker = Child(roomRoot, (name == "objects" ? "Weight " : "Interaction ") + item["id"]);
                            marker.localPosition = MuseumCoordinates.ToUnity(Vector(item["p"]));
                            var anchor = Anchor(marker, item, name == "objects" ? "object" : "interactable", id);
                            anchor.initiallyAvailable = InitialCondition(item["requires"]);
                            if (!anchor.initiallyAvailable) continue;
                            float size = name == "objects" ? (float)item["size"] : 0.3f;
                            Cube(marker, "Placeholder", Vector3.zero, Vector3.one * size, name == "objects" ? weight : brass);
                        }
                    var spawn = Child(roomRoot, "Player eye spawn");
                    spawn.localPosition = MuseumCoordinates.ToUnity(Vector(room["spawn"]["p"]));
                    spawn.localRotation = MuseumCoordinates.Orientation(Vector(room["spawn"]["forward"]), Vector(room["spawn"]["up"]));
                    Anchor(spawn, room["spawn"], "spawn", id);
                    Label(roomRoot, "Room title", id.ToUpperInvariant() + " · " + room["name"], new Vector3(0, 0.03f, 0), 0.18f,
                        (Vector(room["bounds"]["max"]).x - Vector(room["bounds"]["min"]).x) * 0.75f).localRotation = Quaternion.Euler(90, 0, 0);
                }
                return root;
            }
            catch { Object.DestroyImmediate(root); throw; }
        }

        public struct ShellBox { public string name; public Vector3 center, size; public bool floor; }

        /// <summary>Partition each bounds face around all authored portal rectangles, including wall-gravity frames.</summary>
        public static IEnumerable<ShellBox> ShellBoxes(JToken room, IEnumerable<JToken> portals)
        {
            var min = Vector(room["bounds"]["min"]); var max = Vector(room["bounds"]["max"]);
            for (int axis = 0; axis < 3; axis++)
                foreach (int sign in new[] { -1, 1 })
                {
                    if (axis == 1 && sign == 1) continue; // Editor cutaway, not the final runtime shell.
                    int a = (axis + 1) % 3, b = (axis + 2) % 3;
                    float edge = sign < 0 ? min[axis] : max[axis];
                    var holes = new List<Rect>();
                    foreach (var portal in portals)
                    {
                        var center = Vector(portal["center"]); var normal = Vector(portal["normal"]); var up = Vector(portal["up"]);
                        if (Mathf.Abs(center[axis] - edge) > Epsilon || normal[axis] * sign > -0.999f) continue;
                        var right = Vector3.Cross(up, normal);
                        var extent = Abs(right) * ((float)portal["width"] / 2) + Abs(up) * ((float)portal["height"] / 2);
                        holes.Add(Rect.MinMaxRect(Mathf.Max(min[a], center[a] - extent[a]), Mathf.Max(min[b], center[b] - extent[b]), Mathf.Min(max[a], center[a] + extent[a]), Mathf.Min(max[b], center[b] + extent[b])));
                    }
                    var cutsA = holes.SelectMany(h => new[] { h.xMin, h.xMax }).Concat(new[] { min[a], max[a] }).Distinct().OrderBy(v => v).ToArray();
                    var cutsB = holes.SelectMany(h => new[] { h.yMin, h.yMax }).Concat(new[] { min[b], max[b] }).Distinct().OrderBy(v => v).ToArray();
                    for (int x = 0; x < cutsA.Length - 1; x++)
                        for (int y = 0; y < cutsB.Length - 1; y++)
                        {
                            var mid = new Vector2((cutsA[x] + cutsA[x + 1]) / 2, (cutsB[y] + cutsB[y + 1]) / 2);
                            if (holes.Any(h => h.Contains(mid))) continue;
                            var size = Vector3.zero; size[axis] = 0.16f; size[a] = cutsA[x + 1] - cutsA[x]; size[b] = cutsB[y + 1] - cutsB[y];
                            if (size[a] < Epsilon || size[b] < Epsilon) continue;
                            // Seal partition edges: exact butt joints can expose bright pinholes under
                            // multisample coverage and shadow filtering. The overlap stays behind the trim.
                            size[a] += 0.002f; size[b] += 0.002f;
                            var center = Vector3.zero; center[axis] = edge + sign * 0.08f; center[a] = mid.x; center[b] = mid.y;
                            yield return new ShellBox { name = $"Face {axis} {sign} {x} {y}", center = center, size = size, floor = axis == 1 };
                        }
                }
        }

        private static void CreateScene(GameObject prefab, JObject document, Scene previous)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            try
            {
                SceneManager.SetActiveScene(scene);
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                var startRoom = (string)document["world"]["startRoom"];
                var spawn = instance.GetComponentsInChildren<MuseumAnchor>().First(a => a.kind == "spawn" && a.roomId == startRoom);
                var cameraObject = new GameObject("Preview Camera (no player controller)");
                SceneManager.MoveGameObjectToScene(cameraObject, scene);
                cameraObject.transform.SetPositionAndRotation(spawn.transform.position, spawn.transform.rotation);
                var camera = cameraObject.AddComponent<Camera>();
                camera.tag = "MainCamera"; camera.fieldOfView = 70; camera.farClipPlane = 65;
                camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = new Color(0.09f, 0.12f, 0.16f);
                var lightObject = new GameObject("Preview Daylight");
                SceneManager.MoveGameObjectToScene(lightObject, scene);
                lightObject.transform.rotation = Quaternion.Euler(45, -25, 0);
                var light = lightObject.AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.4f; light.shadows = LightShadows.Soft;
                RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(0.35f, 0.39f, 0.45f);
                if (!EditorSceneManager.SaveScene(scene, ScenePath)) throw new IOException("Could not save preview scene.");
            }
            finally
            {
                EditorSceneManager.CloseScene(scene, true);
                if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
            }
        }

        private static MuseumAnchor Anchor(Transform target, JToken data, string kind, string room)
        {
            var anchor = target.gameObject.AddComponent<MuseumAnchor>();
            anchor.sourceId = (string)data["id"] ?? room + ":" + kind;
            anchor.roomId = room; anchor.kind = kind; anchor.sourceJson = data.ToString(Formatting.None);
            return anchor;
        }
        public static Vector3 Vector(JToken token)
        {
            if (!(token is JArray values) || values.Count != 3) throw new InvalidDataException("Expected a three-component vector.");
            var vector = new Vector3((float)values[0], (float)values[1], (float)values[2]);
            if (float.IsNaN(vector.sqrMagnitude) || float.IsInfinity(vector.sqrMagnitude)) throw new InvalidDataException("Non-finite vector.");
            return vector;
        }
        private static Vector3 Abs(Vector3 value) => new Vector3(Mathf.Abs(value.x), Mathf.Abs(value.y), Mathf.Abs(value.z));
        private static Transform Child(Transform parent, string name)
        {
            var child = new GameObject(name).transform;
            child.SetParent(parent, false);
            return child;
        }
        private static void Cube(Transform parent, string name, Vector3 position, Vector3 size, Material material)
        {
            var cube = GameObject.CreatePrimitive(PrimitiveType.Cube); cube.name = name;
            cube.transform.SetParent(parent, false); cube.transform.localPosition = position; cube.transform.localScale = size;
            cube.GetComponent<Renderer>().sharedMaterial = material;
        }
        private static Transform Label(Transform parent, string name, string text, Vector3 position, float size, float maxWidth)
        {
            var label = Child(parent, name); label.localPosition = position;
            // TextMesh faces local -Z. Face the portal's inward +Z direction.
            label.localRotation = Quaternion.Euler(0, 180, 0);
            var mesh = label.gameObject.AddComponent<TextMesh>(); mesh.text = text; mesh.fontSize = 64;
            mesh.characterSize = size; mesh.anchor = TextAnchor.MiddleCenter; mesh.color = new Color(0.83f, 0.85f, 0.8f);
            float width = mesh.GetComponent<Renderer>().localBounds.size.x;
            if (width > maxWidth) label.localScale = Vector3.one * (maxWidth / width);
            return label;
        }
        private static Material Material(string name, Color color, float metallic, float smoothness, bool transparent = false)
        {
            EnsureFolder(GeneratedPath + "/Materials");
            string path = GeneratedPath + "/Materials/" + name + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                var shader = Shader.Find("Universal Render Pipeline/Lit") ?? throw new InvalidOperationException("URP Lit shader is missing.");
                material = new Material(shader); AssetDatabase.CreateAsset(material, path);
            }
            material.SetColor("_BaseColor", color); material.SetFloat("_Metallic", metallic); material.SetFloat("_Smoothness", smoothness);
            if (transparent)
            {
                material.SetFloat("_Surface", 1); material.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
                material.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha); material.SetFloat("_ZWrite", 0);
                material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); material.SetOverrideTag("RenderType", "Transparent"); material.renderQueue = 3000;
                material.SetShaderPassEnabled("ShadowCaster", false);
            }
            EditorUtility.SetDirty(material); AssetDatabase.SaveAssetIfDirty(material);
            return material;
        }
        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = path.Substring(0, path.LastIndexOf('/'));
            EnsureFolder(parent); AssetDatabase.CreateFolder(parent, path.Substring(path.LastIndexOf('/') + 1));
        }
    }
}
