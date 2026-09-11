Shader "Museum/PortalView"
{
    Properties
    {
        _PortalView("Destination view", 2D) = "black" {}
        _ClosedColor("Closed aperture", Color) = (0.025, 0.05, 0.055, 1)
        _Live("Live view", Float) = 0
        _DepthClip("Clip nested apertures at the exit plane", Float) = 1
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry+10" }
        Pass
        {
            Name "PortalView"
            Tags { "LightMode"="UniversalForwardOnly" }
            Cull Off
            ZWrite On
            ZTest LEqual
            // Root views use hardware depth clamping, which preserves homogeneous clipping and
            // perspective interpolation even when a diagonal aperture straddles the camera plane.
            ZClip [_DepthClip]
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_PortalView);
            SAMPLER(sampler_PortalView);
            CBUFFER_START(UnityPerMaterial)
                half4 _ClosedColor;
                float _Live;
                float _DepthClip;
            CBUFFER_END
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float4 screenPosition : TEXCOORD0; };
            Varyings Vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs vertex = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = vertex.positionCS;
                // URP's positionNDC accounts for the current render target's projection flip.
                output.screenPosition = vertex.positionNDC;
                return output;
            }
            half4 Frag(Varyings input) : SV_Target
            {
                if (_Live < 0.5) return _ClosedColor;
                float2 uv = input.screenPosition.xy / input.screenPosition.w;
                // Linear HDR destination radiance: the player view handles the final display transform.
                return half4(SAMPLE_TEXTURE2D(_PortalView, sampler_PortalView, uv).rgb, 1);
            }
            ENDHLSL
        }
    }
}
