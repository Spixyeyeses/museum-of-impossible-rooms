using System;
using UnityEngine;

namespace Museum
{
    /// <summary>Portal view math uses aperture frames, never the spacing between preview rooms.</summary>
    public static class MuseumPortalMath
    {
        private static readonly Quaternion HalfTurn = Quaternion.Euler(0, 180, 0);

        public static float Scale(float sourceHeight, float destinationHeight)
        {
            if (sourceHeight <= 0 || destinationHeight <= 0 || float.IsNaN(sourceHeight) || float.IsNaN(destinationHeight)
                || float.IsInfinity(sourceHeight) || float.IsInfinity(destinationHeight))
                throw new ArgumentOutOfRangeException(nameof(sourceHeight), "Portal heights must be finite and positive.");
            return destinationHeight / sourceHeight;
        }

        public static Vector3 TransformPoint(Transform source, Transform destination, Vector3 point, float scale)
        {
            // Deliberately use rotation and position only: authored aperture dimensions define scale.
            Vector3 local = Quaternion.Inverse(source.rotation) * (point - source.position);
            return destination.position + destination.rotation * (HalfTurn * local * scale);
        }

        public static Quaternion TransformRotation(Transform source, Transform destination, Quaternion rotation) =>
            destination.rotation * HalfTurn * Quaternion.Inverse(source.rotation) * rotation;

        /// <summary>The positive half-space is the visible interior, along the destination's inward normal.</summary>
        public static Vector4 CameraClipPlane(Camera camera, Transform destination, float inset)
        {
            Vector3 point = camera.worldToCameraMatrix.MultiplyPoint(destination.position + destination.forward * inset);
            Vector3 normal = camera.worldToCameraMatrix.MultiplyVector(destination.forward).normalized;
            return new Vector4(normal.x, normal.y, normal.z, -Vector3.Dot(normal, point));
        }

        public static void ConfigureCamera(Camera sourceCamera, Camera viewCamera, Transform source, Transform destination,
            float sourceHeight, float destinationHeight)
        {
            float scale = Scale(sourceHeight, destinationHeight);
            viewCamera.CopyFrom(sourceCamera);
            viewCamera.enabled = false;
            viewCamera.targetTexture = null;
            viewCamera.rect = new Rect(0, 0, 1, 1);
            viewCamera.useOcclusionCulling = false;
            viewCamera.transform.SetPositionAndRotation(TransformPoint(source, destination, sourceCamera.transform.position, scale),
                TransformRotation(source, destination, sourceCamera.transform.rotation));
            // Stabilize the virtual eye, not the clipping plane. Moving the plane into the room can cut away
            // the entire front face of a carried cube whose leading face has only just crossed the aperture.
            float eyeDistance = Vector3.Dot(viewCamera.transform.position - destination.position, destination.forward);
            float minimumEyeDistance = Mathf.Max(0.0001f, destinationHeight * 0.00002f);
            if (eyeDistance > -minimumEyeDistance && eyeDistance < 0.001f)
                viewCamera.transform.position -= destination.forward * (minimumEyeDistance + eyeDistance);
            viewCamera.nearClipPlane = Mathf.Max(0.00001f, sourceCamera.nearClipPlane * scale);
            viewCamera.farClipPlane = Mathf.Max(viewCamera.nearClipPlane + 1, sourceCamera.farClipPlane * scale);
            // A parent portal camera already has an oblique matrix. Start this view from a fresh perspective matrix.
            viewCamera.ResetWorldToCameraMatrix();
            viewCamera.ResetProjectionMatrix();
            viewCamera.aspect = sourceCamera.aspect;
            var clip = CameraClipPlane(viewCamera, destination, 0);
            viewCamera.projectionMatrix = viewCamera.CalculateObliqueMatrix(clip);
            viewCamera.cullingMatrix = viewCamera.projectionMatrix * viewCamera.worldToCameraMatrix;
        }
    }
}
