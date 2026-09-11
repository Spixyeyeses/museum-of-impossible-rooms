using UnityEngine;

namespace Museum
{
    /// <summary>Reflect Z at the presentation boundary; JSON stays in source room-local coordinates.</summary>
    public static class MuseumCoordinates
    {
        public static Vector3 ToUnity(Vector3 source) => new Vector3(source.x, source.y, -source.z);
        public static Vector3 ToSource(Vector3 unity) => ToUnity(unity);
        public static Quaternion Orientation(Vector3 forward, Vector3 up) =>
            Quaternion.LookRotation(ToUnity(forward), ToUnity(up));
    }
}
