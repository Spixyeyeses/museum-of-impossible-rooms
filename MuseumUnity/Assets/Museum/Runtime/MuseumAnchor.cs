using UnityEngine;

namespace Museum
{
    /// <summary>Authored identity and unchanged source data. Preview placement is not portal topology.</summary>
    public sealed class MuseumAnchor : MonoBehaviour
    {
        public string sourceId;
        public string roomId;
        public string kind;
        public string destinationId;
        public bool initiallyAvailable = true;
        [TextArea(3, 12)] public string sourceJson;

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = initiallyAvailable ? Color.cyan : Color.gray;
            Gizmos.DrawWireSphere(transform.position, 0.18f);
            Gizmos.DrawRay(transform.position, transform.forward * 0.7f);
            Gizmos.color = Color.green;
            Gizmos.DrawRay(transform.position, transform.up * 0.5f);
        }
    }
}
