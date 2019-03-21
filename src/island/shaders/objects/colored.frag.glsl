#version 300 es
precision highp float;

uniform sampler2D palette;
uniform sampler2D noise;
uniform vec3 light;

in vec3 vPosition;
in vec3 vNormal;
in float vColor;
in vec3 vMVPos;

out vec4 fragColor;

#require "../common/fog.frag"
#require "../common/dither.frag"
#require "../common/intensity.frag"

void main() {
    fragColor = vec4(fog(dither(vColor, intensity()).rgb), 1.0);
}
