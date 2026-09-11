using System.IO;
using System.Linq;
using Museum.Editor;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Museum.Tests
{
    public sealed class MuseumImportTests
    {
        [Test]
        public void CoordinatesPreserveDistancesAndSpawnFacing()
        {
            var point = new Vector3(3, 1.6f, -5);
            Assert.That(MuseumCoordinates.ToSource(MuseumCoordinates.ToUnity(point)), Is.EqualTo(point));
            Assert.That(MuseumCoordinates.ToUnity(point).magnitude, Is.EqualTo(point.magnitude));
            var rotation = MuseumCoordinates.Orientation(Vector3.back, Vector3.up);
            Assert.That(Vector3.Distance(rotation * Vector3.forward, Vector3.forward), Is.LessThan(0.0001f));
        }

        [Test]
        public void RotatedPortalKeepsItsAuthoredUpDirection()
        {
            var rotation = MuseumCoordinates.Orientation(Vector3.forward, Vector3.left);
            Assert.That(Vector3.Distance(rotation * Vector3.up, Vector3.left), Is.LessThan(0.0001f));
            Assert.That(Vector3.Distance(rotation * Vector3.forward, Vector3.back), Is.LessThan(0.0001f));
        }

        [TestCase("null", true)]
        [TestCase("{\"not\":\"summer\"}", true)]
        [TestCase("\"summer\"", false)]
        [TestCase("{\"all\":[true,{\"any\":[false,{\"not\":\"unlocked\"}]}]}", true)]
        [TestCase("[true,\"locked\"]", false)]
        public void InitialConditionTreesMatchEmptyCampaignFlags(string json, bool expected)
        {
            Assert.That(MuseumWorldImporter.InitialCondition(JToken.Parse(json)), Is.EqualTo(expected));
        }

        [Test]
        public void SchemaAndBrokenConnectionsAreRejected()
        {
            var document = MuseumWorldImporter.ReadDocument();
            document["schemaVersion"] = 2;
            Assert.Throws<InvalidDataException>(() => MuseumWorldImporter.ValidateDocument(document));
            document["schemaVersion"] = 1;
            document["world"]["portals"][0]["to"] = "absent";
            Assert.Throws<InvalidDataException>(() => MuseumWorldImporter.ValidateDocument(document));
        }

        [Test]
        public void ShellLeavesAllPortalAperturesClearIncludingQuarterScaleAndWallGravity()
        {
            var world = MuseumWorldImporter.ReadDocument()["world"];
            foreach (var room in world["rooms"])
            {
                var portals = world["portals"].Where(p => (string)p["room"] == (string)room["id"]).ToArray();
                var boxes = MuseumWorldImporter.ShellBoxes(room, portals).ToArray();
                foreach (var portal in portals)
                {
                    var center = MuseumWorldImporter.Vector(portal["center"]);
                    var normal = MuseumWorldImporter.Vector(portal["normal"]);
                    var up = MuseumWorldImporter.Vector(portal["up"]);
                    var right = Vector3.Cross(up, normal);
                    // Probe just behind the portal plane where the generated wall has thickness.
                    foreach (float x in new[] { -0.49f, 0f, 0.49f })
                        foreach (float y in new[] { -0.49f, 0f, 0.49f })
                        {
                            var probe = center + right * (float)portal["width"] * x + up * (float)portal["height"] * y - normal * 0.08f;
                            Assert.That(boxes.Any(box => new Bounds(box.center, box.size).Contains(probe)), Is.False, $"Blocked aperture: {portal["id"]}");
                        }
                }
                var min = MuseumWorldImporter.Vector(room["bounds"]["min"]);
                var max = MuseumWorldImporter.Vector(room["bounds"]["max"]);
                var floorPoint = new Vector3((min.x + max.x) / 2, min.y - 0.08f, (min.z + max.z) / 2);
                Assert.That(boxes.Any(box => box.floor && new Bounds(box.center, box.size).Contains(floorPoint)), Is.True, $"Missing floor: {room["id"]}");
            }
        }

        [Test]
        public void ImportPreservesSourceIdentitiesUserSceneAndAssetGuids()
        {
            // Unity Test Runner already supplies an isolated untitled scene.
            var sentinelScene = SceneManager.GetActiveScene();
            var sentinel = new GameObject("Unsaved user object");
            SceneManager.MoveGameObjectToScene(sentinel, sentinelScene);
            EditorSceneManager.MarkSceneDirty(sentinelScene);
            try
            {
                MuseumWorldImporter.Import();
                var guid = AssetDatabase.AssetPathToGUID(MuseumWorldImporter.PrefabPath);
                var sceneBytes = File.Exists(MuseumWorldImporter.ScenePath) ? File.ReadAllBytes(MuseumWorldImporter.ScenePath) : null;
                MuseumWorldImporter.Import();
                Assert.That(AssetDatabase.AssetPathToGUID(MuseumWorldImporter.PrefabPath), Is.EqualTo(guid));
                if (sceneBytes != null) Assert.That(File.ReadAllBytes(MuseumWorldImporter.ScenePath), Is.EqualTo(sceneBytes));
                else Assert.That(File.Exists(MuseumWorldImporter.ScenePath), Is.False);
                Assert.That(SceneManager.GetActiveScene(), Is.EqualTo(sentinelScene));
                Assert.That(sentinelScene.isDirty, Is.True);
                Assert.That(sentinel != null, Is.True);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(MuseumWorldImporter.PrefabPath);
                var anchors = prefab.GetComponentsInChildren<MuseumAnchor>(true);
                var world = MuseumWorldImporter.ReadDocument()["world"];
                foreach (var mapping in new[] { ("rooms", "room"), ("portals", "portal"), ("objects", "object"), ("interactables", "interactable") })
                {
                    var imported = anchors.Where(a => a.kind == mapping.Item2).ToArray();
                    Assert.That(imported.Length, Is.EqualTo(world[mapping.Item1].Count()));
                    foreach (var item in world[mapping.Item1])
                    {
                        var anchor = imported.Single(a => a.sourceId == (string)item["id"]);
                        Assert.That(JToken.DeepEquals(JToken.Parse(anchor.sourceJson), item), Is.True, anchor.sourceId);
                        var label = anchor.kind == "portal" ? anchor.GetComponentInChildren<TextMesh>() : null;
                        if (label != null) Assert.That(label.GetComponent<Renderer>().localBounds.size.x * label.transform.localScale.x,
                            Is.LessThanOrEqualTo((float)item["width"] * 1.05f + 0.001f), $"Caption exceeds its doorway: {anchor.sourceId}");
                    }
                }
                var winter = anchors.Single(a => a.sourceId == "garden-winter");
                var summer = anchors.Single(a => a.sourceId == "garden-summer");
                Assert.That(winter.initiallyAvailable, Is.True);
                Assert.That(summer.initiallyAvailable, Is.False);
                Assert.That(summer.GetComponentsInChildren<Renderer>().Length, Is.Zero);
                var hiddenExit = anchors.Single(a => a.sourceId == "hub-10");
                Assert.That(hiddenExit.transform.Find("Hidden boundary"), Is.Not.Null);
                var quarter = anchors.Single(a => a.sourceId == "quarter-out");
                Assert.That(Vector3.Distance(quarter.transform.localPosition, new Vector3(0, 0.45f, -7)), Is.LessThan(0.0001f));
            }
            finally
            {
                Object.DestroyImmediate(sentinel);
            }
        }
    }
}
