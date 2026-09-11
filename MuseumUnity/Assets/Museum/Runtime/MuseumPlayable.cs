using System;
using System.Collections.Generic;
using System.Linq;
using Museum.Simulation;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Museum
{
    /// <summary>Input, presentation and a small exhibition interface around the room-local simulation.</summary>
    [DefaultExecutionOrder(-100)]
    public sealed class MuseumPlayable : MonoBehaviour
    {
        public TextAsset campaignContent;
        public GameObject layoutPrefab;
        public Shader portalShader;
        public Shader travellerShader;
        public Camera playerCamera;
        public string startingRoom = "c1";
        public float mouseSensitivity = 0.0022f;
        public MuseumSimulation Simulation { get; private set; }
        public MuseumPortalRenderer PortalRenderer { get; private set; }
        public MuseumTravellerRenderer TravellerRenderer { get; private set; }
        public bool MenuVisible { get; private set; } = true;
        public string StatusText { get; private set; }

        private MuseumWorld world;
        private GameObject layout;
        private MuseumAnchor[] anchors, roomAnchors, portalAnchors;
        private Dictionary<string, Transform> roomRoots;
        private Dictionary<string, MuseumAnchor> objectAnchors;
        private readonly List<Material> ownedMaterials = new List<Material>();
        private string noteTitle, noteText;
        private float accumulator, statusUntil;
        private bool initialized;
        private GUIStyle titleStyle, bodyStyle, labelStyle, buttonStyle;

        private void Awake()
        {
            if (campaignContent == null || layoutPrefab == null || playerCamera == null)
            { Debug.LogError("The playable scene is missing its campaign, layout or camera references.", this); enabled = false; return; }
            world = MuseumWorld.Parse(campaignContent.text);
            layout = Instantiate(layoutPrefab, transform);
            layout.name = "Museum rooms";
            anchors = layout.GetComponentsInChildren<MuseumAnchor>(true);
            roomAnchors = anchors.Where(a => a.kind == "room").ToArray();
            portalAnchors = anchors.Where(a => a.kind == "portal").ToArray();
            roomRoots = roomAnchors.ToDictionary(a => a.roomId, a => a.transform);
            objectAnchors = anchors.Where(a => a.kind == "object").ToDictionary(a => a.sourceId);
            foreach (var text in layout.GetComponentsInChildren<TextMesh>(true)) text.gameObject.SetActive(false);
            // The simulation owns collisions. Imported Unity colliders are only editor layout aids.
            foreach (var collider in layout.GetComponentsInChildren<Collider>(true)) Destroy(collider);
            AddRoomLightingAndFixtures();
            TravellerRenderer = gameObject.AddComponent<MuseumTravellerRenderer>();
            TravellerRenderer.Initialize(roomAnchors, portalAnchors, anchors.Where(a => a.kind == "object").ToArray(), travellerShader);
            PortalRenderer = gameObject.AddComponent<MuseumPortalRenderer>();
            PortalRenderer.portalShader = portalShader;
            PortalRenderer.Initialize(playerCamera, roomAnchors, portalAnchors);
            initialized = true;
            BeginVisit(startingRoom);
            SetMenuVisible(true);
        }

        public void BeginVisit(string roomId)
        {
            if (world == null || !world.Rooms.ContainsKey(roomId)) return;
            Simulation = new MuseumSimulation(world, roomId);
            accumulator = 0; noteText = null; noteTitle = null;
            Say("Follow the bronze doorways. Press E to examine an exhibit or pick up its weight.", 7);
            RefreshPresentation();
        }

        public void SetMenuVisible(bool visible)
        {
            MenuVisible = visible;
            Cursor.lockState = visible ? CursorLockMode.None : CursorLockMode.Locked;
            Cursor.visible = visible;
            accumulator = 0;
        }

        private void Update()
        {
            if (!initialized || Simulation == null) return;
            var keyboard = Keyboard.current;
            if (keyboard != null && keyboard.escapeKey.wasPressedThisFrame)
            {
                if (noteText != null) { noteText = null; SetMenuVisible(false); }
                else SetMenuVisible(!MenuVisible);
            }
            if (MenuVisible) return;
            var mouse = Mouse.current;
            if (mouse != null && Cursor.lockState == CursorLockMode.Locked)
            {
                var delta = mouse.delta.ReadValue();
                Simulation.Look(delta.x * mouseSensitivity, -delta.y * mouseSensitivity);
            }
            float forward = keyboard == null ? 0 : (keyboard.wKey.isPressed ? 1 : 0) - (keyboard.sKey.isPressed ? 1 : 0);
            float strafe = keyboard == null ? 0 : (keyboard.dKey.isPressed ? 1 : 0) - (keyboard.aKey.isPressed ? 1 : 0);
            accumulator += Mathf.Min(Time.unscaledDeltaTime, 0.06f);
            const float step = 1f / 90f;
            while (accumulator >= step)
            {
                Simulation.Step(step, forward, strafe, keyboard != null && keyboard.leftShiftKey.isPressed);
                UpdateArrangements(step);
                accumulator -= step;
            }
            if (keyboard != null && keyboard.eKey.wasPressedThisFrame) Interact();
            if (keyboard != null && keyboard.qKey.wasPressedThisFrame && Simulation.State.Held != null)
                Say(Simulation.Drop() ? "Weight placed." : "There is not enough space to place the weight here.");
            if (keyboard != null && keyboard.rKey.wasPressedThisFrame) Recover();
            if (keyboard != null && keyboard.hKey.wasPressedThisFrame) ShowHint();
        }

        private void LateUpdate() { if (initialized) RefreshPresentation(); }

        public void RefreshPresentation()
        {
            if (Simulation == null) return;
            var player = Simulation.State.Player;
            playerCamera.transform.SetPositionAndRotation(roomRoots[player.Room].TransformPoint(MuseumCoordinates.ToUnity(player.Position)),
                MuseumCoordinates.Orientation(player.Forward, player.Up));
            playerCamera.nearClipPlane = Mathf.Max(0.001f, 0.035f * player.Scale);
            playerCamera.farClipPlane = 160f;
            foreach (var entry in Simulation.State.Objects)
            {
                if (!objectAnchors.TryGetValue(entry.Key, out var anchor)) continue;
                var item = entry.Value;
                if (anchor.transform.parent != roomRoots[item.Room]) anchor.transform.SetParent(roomRoots[item.Room], false);
                anchor.transform.localPosition = MuseumCoordinates.ToUnity(item.Position);
                var shape = anchor.transform.Find("Placeholder");
                if (shape != null) shape.localScale = Vector3.one * item.Size;
            }
            foreach (var portal in portalAnchors)
            {
                bool open = Simulation.IsPortalOpen(world.Portals[portal.sourceId]);
                var blocker = portal.transform.Find("Closed in initial state");
                if (blocker != null) blocker.gameObject.SetActive(!open);
                var hidden = portal.transform.Find("Hidden boundary");
                if (hidden != null) hidden.gameObject.SetActive(!open);
            }
            foreach (var anchor in anchors.Where(a => a.kind == "interactable"))
            {
                var item = world.Interactables.First(it => it.Id == anchor.sourceId);
                anchor.gameObject.SetActive(Simulation.Condition(item.Requires) && !Simulation.Flag((string)item.Data["hideFlag"]));
            }
            PortalRenderer.SetState(player.Room, id => world.Portals.TryGetValue(id, out var portal) && Simulation.IsPortalOpen(portal));
            TravellerRenderer.SetState(id => world.Portals.TryGetValue(id, out var portal) && Simulation.IsPortalOpen(portal));
        }

        public void Recover()
        {
            Simulation.Recover(); accumulator = 0;
            Say("Returned to the exhibition entrance. Loose weights have been recalled.");
            RefreshPresentation();
        }

        public void Interact()
        {
            var hit = Simulation.Trace();
            if (hit == null) { if (Simulation.State.Held != null) Say(Simulation.Drop() ? "Weight placed." : "There is not enough space to place the weight here."); return; }
            if (hit.Kind == "object")
            {
                if (Simulation.State.Held == null) Say(Simulation.PickUp(hit.Id) ? "Weight in hand. Its measure changes with the route you take." : "This weight cannot be picked up.");
                else Say(Simulation.Drop() ? "Weight placed." : "There is not enough space to place the weight here.");
                return;
            }
            var item = world.Interactables.FirstOrDefault(it => it.Id == hit.Id);
            if (item == null) return;
            var data = item.Data;
            string flag = (string)data["flag"];
            switch ((string)data["type"])
            {
                case "note": case "lore":
                    noteTitle = (string)data["title"]; noteText = (string)data["text"]; SetMenuVisible(true); break;
                case "socket":
                    if (Simulation.Condition(data["flag"])) { Say("This index is complete."); break; }
                    float required = (float)data["acceptSize"];
                    if (Simulation.State.Held == null) { Say($"This plinth accepts a {required:0.00} m index weight."); break; }
                    var weight = Simulation.State.Objects[Simulation.State.Held];
                    if (Mathf.Abs(weight.Size - required) > 0.008f) { Say($"The weight measures {weight.Size:0.00} m. This plinth needs {required:0.00} m."); break; }
                    weight.Room = item.Room; weight.Position = item.Position + Vector3.up * (weight.Size / 2 + 0.08f);
                    weight.Velocity = Vector3.zero; weight.Socketed = true; weight.Socket = item.Id;
                    Simulation.State.Held = null; Simulation.State.HeldRatio = 0; Simulation.State.Flags[flag] = true;
                    CompleteIndices(); Say("The weight fits. The index is restored.", 8); break;
                case "gravity":
                    var target = ReadVector(data["up"]);
                    bool changed = Simulation.SetGravity(Vector3.Dot(Simulation.State.Player.Up, target) > 0.9f ? Vector3.up : target);
                    Say(changed ? "The floor has changed. Let yourself settle, then continue walking." : "There is not enough space to change the floor here."); break;
                case "memory":
                    Simulation.State.Flags[flag] = true; CompleteIndices(); Say("The index plate is restored."); break;
                case "shutter":
                    if ((bool?)data["latch"] == true && Simulation.Condition(data["flag"])) { Say("This arrangement is settled."); break; }
                    Simulation.State.Flags["armed:" + item.Id] = true; Simulation.State.Flags["unseen:" + item.Id] = 0;
                    Say("Turn fully away from the arch for a moment."); break;
                case "align": Say("Stand on the observation mark and hold your gaze through the far frame."); break;
                case "finish": Simulation.State.Flags["complete:10"] = true; Simulation.State.Flags["finished"] = true;
                    noteTitle = "A way out, for both of us."; noteText = "Iona Vale has departed safely at dawn. For the first time, the ledger records a departure without erasing an arrival."; SetMenuVisible(true); break;
            }
        }

        private void UpdateArrangements(float dt)
        {
            var player = Simulation.State.Player;
            var room = world.Rooms[player.Room].Data;
            int chapter = (int?)room["chapter"] ?? 0;
            if (chapter > 0) Simulation.State.Checkpoint = "c" + chapter;
            foreach (var item in world.Interactables.Where(it => it.Room == player.Room && Simulation.Condition(it.Requires)))
            {
                var data = item.Data; string flag = (string)data["flag"], type = (string)data["type"];
                if (type == "align" && !Simulation.Condition(data["flag"]))
                {
                    var direction = ReadVector(data["target"]) - player.Position;
                    bool aligned = Vector3.Distance(player.Position, item.Position) < (float)data["spotRadius"]
                        && Vector3.Dot(player.Forward, direction.normalized) > (float)data["tolerance"]
                        && (data["up"] == null || Vector3.Dot(player.Up, ReadVector(data["up"])) > 0.95f);
                    string key = "charge:" + item.Id;
                    float charge = aligned ? Mathf.Min((float)data["hold"], ((float?)Simulation.State.Flags[key] ?? 0) + dt) : 0;
                    Simulation.State.Flags[key] = charge;
                    if (charge >= (float)data["hold"]) { Simulation.State.Flags[flag] = true; Say("The outline settles. A connection remains."); }
                }
                if (type == "shutter" && Simulation.Flag("armed:" + item.Id))
                {
                    var direction = ReadVector(data["target"]) - player.Position;
                    string key = "unseen:" + item.Id;
                    float unseen = Vector3.Dot(player.Forward, direction.normalized) <= -0.05f && direction.magnitude >= 3
                        ? ((float?)Simulation.State.Flags[key] ?? 0) + dt : 0;
                    Simulation.State.Flags[key] = unseen;
                    if (unseen > 0.75f)
                    {
                        Simulation.State.Flags[flag] = (bool?)data["latch"] == true || !Simulation.Condition(data["flag"]);
                        Simulation.State.Flags["armed:" + item.Id] = false; Simulation.State.Flags[key] = 0;
                        Say("A latch sounds. The arrangement has changed.");
                    }
                }
            }
        }

        private void CompleteIndices()
        {
            foreach (var chapter in world.Data["chapters"])
                if (Simulation.Condition(chapter["completeFlag"])) Simulation.State.Flags["solved:" + chapter["id"]] = true;
        }

        private void ShowHint()
        {
            int chapterId = (int?)world.Rooms[Simulation.State.Player.Room].Data["chapter"] ?? 0;
            var chapter = world.Data["chapters"].FirstOrDefault(c => (int)c["id"] == chapterId);
            noteTitle = chapter == null ? "Finding your route" : (string)chapter["title"];
            noteText = chapter == null ? "The numbered exhibitions begin in the court." : (string)chapter["hints"][2];
            SetMenuVisible(true);
        }

        private void Say(string text, float seconds = 5) { StatusText = text; statusUntil = Time.unscaledTime + seconds; }

        private void AddRoomLightingAndFixtures()
        {
            var wallMaterial = layout.GetComponentsInChildren<Renderer>().First(r => r.sharedMaterial != null && r.sharedMaterial.name == "Wall").sharedMaterial;
            var metal = NewMaterial(new Color(0.14f, 0.2f, 0.23f), 0.5f, 0.4f);
            var lightMaterial = NewMaterial(new Color(0.83f, 0.94f, 1f), 0, 0.3f);
            lightMaterial.EnableKeyword("_EMISSION"); lightMaterial.SetColor("_EmissionColor", new Color(0.8f, 0.92f, 1f) * 3f);
            foreach (var room in roomAnchors)
            {
                var data = JObject.Parse(room.sourceJson);
                var min = ReadVector(data["bounds"]["min"]); var max = ReadVector(data["bounds"]["max"]);
                var center = (min + max) * 0.5f;
                if ((bool?)data["openSky"] != true)
                    Box(room.transform, "Ceiling", MuseumCoordinates.ToUnity(new Vector3(center.x, max.y + 0.08f, center.z)), new Vector3(max.x - min.x + 0.3f, 0.16f, max.z - min.z + 0.3f), wallMaterial);
                float span = Mathf.Min(3f, (max.x - min.x) * 0.28f);
                foreach (float fraction in new[] { 0.25f, 0.75f })
                {
                    float z = Mathf.Lerp(min.z, max.z, fraction);
                    var position = MuseumCoordinates.ToUnity(new Vector3(center.x, max.y - 0.16f, z));
                    Box(room.transform, "Recessed light surround", position, new Vector3(span + 0.25f, 0.14f, 0.5f), metal);
                    Box(room.transform, "Diffuse light panel", position + Vector3.down * 0.075f, new Vector3(span, 0.025f, 0.3f), lightMaterial);
                    var lamp = new GameObject("Exhibition light"); lamp.transform.SetParent(room.transform, false); lamp.transform.localPosition = position + Vector3.down * 0.45f;
                    // Downward fixtures use a single stable shadow map instead of six point-light faces.
                    // A weak unshadowed bounce lights the housing/ceiling without self-shadow rings.
                    lamp.transform.localRotation = Quaternion.LookRotation(Vector3.down, Vector3.forward);
                    var light = lamp.AddComponent<Light>(); light.type = LightType.Spot; light.color = new Color(0.82f, 0.91f, 1f);
                    light.spotAngle = 145; light.innerSpotAngle = 100;
                    light.range = Mathf.Max(max.x - min.x, max.z - min.z, max.y - min.y) * 1.15f; light.intensity = 9;
                    light.shadows = LightShadows.Soft; light.shadowBias = 0.035f; light.shadowNormalBias = 0.12f;
                    light.shadowCustomResolution = 1024;
                    var bounce = new GameObject("Ceiling bounce"); bounce.transform.SetParent(room.transform, false); bounce.transform.localPosition = position + Vector3.down * 0.6f;
                    var fill = bounce.AddComponent<Light>(); fill.type = LightType.Point; fill.color = light.color;
                    fill.intensity = 0.7f; fill.range = light.range; fill.shadows = LightShadows.None;
                }
            }
            foreach (var anchor in anchors.Where(a => a.kind == "interactable"))
            {
                var data = JObject.Parse(anchor.sourceJson);
                string type = (string)data["type"];
                if (type != "socket" && type != "note" && type != "lore") continue;
                var placeholder = anchor.transform.Find("Placeholder"); if (placeholder != null) placeholder.gameObject.SetActive(false);
                float height = Mathf.Max(0.1f, ReadVector(data["p"]).y);
                float width = type == "socket" ? Mathf.Max(0.25f, (float)data["acceptSize"] * 0.8f) : 0.42f;
                Box(anchor.transform, "Exhibit stand", new Vector3(0, -height / 2, 0), new Vector3(width, height, width), metal);
                Box(anchor.transform, "Exhibit top", new Vector3(0, 0.035f, 0), new Vector3(width * 1.15f, 0.07f, width * 1.15f), wallMaterial);
            }
        }

        private Material NewMaterial(Color color, float metallic, float smoothness)
        {
            var material = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            material.SetColor("_BaseColor", color); material.SetFloat("_Metallic", metallic); material.SetFloat("_Smoothness", smoothness);
            ownedMaterials.Add(material); return material;
        }
        private static void Box(Transform parent, string name, Vector3 position, Vector3 scale, Material material)
        {
            var box = GameObject.CreatePrimitive(PrimitiveType.Cube); box.name = name; box.transform.SetParent(parent, false);
            box.transform.localPosition = position; box.transform.localScale = scale; box.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(box.GetComponent<Collider>());
        }
        private static Vector3 ReadVector(JToken data) => new Vector3((float)data[0], (float)data[1], (float)data[2]);

        private void OnApplicationFocus(bool focus) { if (!focus && initialized) SetMenuVisible(true); }
        private void OnDestroy()
        {
            Cursor.lockState = CursorLockMode.None; Cursor.visible = true;
            foreach (var material in ownedMaterials) if (material != null) Destroy(material);
        }

        private void OnGUI()
        {
            if (!initialized || Simulation == null) return;
            if (titleStyle == null)
            {
                titleStyle = new GUIStyle(GUI.skin.label) { fontSize = 30, wordWrap = true, fontStyle = FontStyle.Bold };
                bodyStyle = new GUIStyle(GUI.skin.label) { fontSize = 18, wordWrap = true };
                labelStyle = new GUIStyle(GUI.skin.label) { fontSize = 15, wordWrap = true };
                buttonStyle = new GUIStyle(GUI.skin.button) { fontSize = 18, fixedHeight = 40 };
            }
            var previous = GUI.matrix;
            float scale = Mathf.Max(0.25f, Mathf.Min(Screen.height / 900f, Screen.width / 1100f)); GUI.matrix = Matrix4x4.Scale(Vector3.one * scale);
            float width = Screen.width / scale, height = Screen.height / scale;
            GUI.Box(new Rect(18, 16, Mathf.Min(620, width - 36), 68), GUIContent.none);
            GUI.Label(new Rect(30, 23, 590, 32), (string)world.Rooms[Simulation.State.Player.Room].Data["name"], bodyStyle);
            GUI.Label(new Rect(30, 54, 570, 24), $"Measure {Simulation.State.Player.Scale:0.##}×   ·   H — exhibition hint", labelStyle);
            if (!MenuVisible)
            {
                GUI.Label(new Rect(width / 2 - 6, height / 2 - 12, 20, 24), "+", bodyStyle);
                var hit = Simulation.Trace();
                string prompt = hit == null ? (Simulation.State.Held != null ? "Q — place weight" : "") : "E — " + (hit.Kind == "object" ? (Simulation.State.Held == null ? "pick up weight" : "place weight") : "examine / use");
                GUI.Label(new Rect(width / 2 - 170, height / 2 + 28, 340, 32), prompt, labelStyle);
                GUI.Label(new Rect(24, height - 35, width - 48, 30), "WASD — walk    Mouse — look    Shift — walk faster    E — use / carry    Q — place weight    R — return    Esc — menu", labelStyle);
                if (Time.unscaledTime < statusUntil) { GUI.Box(new Rect(width / 2 - 355, height - 115, 710, 65), GUIContent.none); GUI.Label(new Rect(width / 2 - 342, height - 106, 684, 55), StatusText, bodyStyle); }
            }
            else
            {
                var area = new Rect((width - 650) / 2, Mathf.Max(100, (height - 540) / 2), 650, 540);
                GUI.Box(area, GUIContent.none);
                GUILayout.BeginArea(new Rect(area.x + 28, area.y + 20, area.width - 56, area.height - 40));
                GUILayout.Label(noteText != null ? noteTitle : "The Museum of Impossible Rooms", titleStyle);
                GUILayout.Space(14);
                if (noteText != null)
                {
                    GUILayout.Label(noteText, bodyStyle); GUILayout.FlexibleSpace();
                    if (GUILayout.Button("Return to the exhibition", buttonStyle)) { noteText = null; SetMenuVisible(false); }
                }
                else
                {
                    GUILayout.Label("A doorway promises a destination. It does not promise a direction.", bodyStyle);
                    GUILayout.Space(18);
                    if (GUILayout.Button("Continue visit", buttonStyle)) SetMenuVisible(false);
                    if (GUILayout.Button("Return to the exhibition entrance", buttonStyle)) { Recover(); SetMenuVisible(false); }
                    GUILayout.Space(22); GUILayout.Label("Choose an exhibition", bodyStyle);
                    if (GUILayout.Button("01   The Gallery of Two Norths", buttonStyle)) { BeginVisit("c1"); SetMenuVisible(false); }
                    if (GUILayout.Button("03   The Scale Cabinet", buttonStyle)) { BeginVisit("c3"); SetMenuVisible(false); }
                    if (GUILayout.Button("06   The Gravity Atrium", buttonStyle)) { BeginVisit("c6"); SetMenuVisible(false); }
                    GUILayout.Space(16); GUILayout.Label("WASD to walk · Mouse to look · E to use / carry · H for a hint", labelStyle);
                    if (!Application.isEditor && GUILayout.Button("Leave the museum", buttonStyle)) Application.Quit();
                }
                GUILayout.EndArea();
            }
            GUI.matrix = previous;
        }
    }
}
