'use strict';
(function() {
	function DOFRenderPass(args, ctx, goo) {
		this.goo = goo;
		this.ctx = ctx;

		this.renderToScreen = true;
		this.clear = true;
		this.enabled = true;
		this.needsSwap = true;
		this.aspect = 0;

		this.updateSize({
			width: ctx.viewportWidth, 
			height: ctx.viewportHeight
		}, ctx.world.gooRunner.renderer);

		this.depthMaterial = new goo.Material('Depth material', depthShaderDef(goo));
		this.depthMaterial.uniforms.focalDistance = this.depthMaterial.shader.uniforms.focalDistance;
		this.depthMaterial.uniforms.fStop = this.depthMaterial.shader.uniforms.fStop;
		this.material = new goo.Material('DOF Material', dofShaderDef(goo));
		this.material.uniforms.fStop = this.material.shader.uniforms.fStop;


		this.renderList = ctx.world.getSystem('RenderSystem').renderList;
		this.fullscreenCamera = goo.FullscreenUtil.camera;
		this.renderable = {
			meshData: goo.FullscreenUtil.quad,
			materials: [this.material]
		};

	}

	DOFRenderPass.prototype.updateSize = function(size, renderer) {
		if (this.depthTarget) {
			this.destroy(renderer);
		}
		this.depthTarget = new this.goo.RenderTarget(size.width, size.height);
		this.colorTarget = new this.goo.RenderTarget(size.width, size.height);
	};

	DOFRenderPass.prototype.destroy = function(renderer) {
		this.depthTarget.destroy(renderer.context);
		this.colorTarget.destroy(renderer.context);
	};

	DOFRenderPass.prototype.render = function (
		renderer,
		writeBuffer,
		readBuffer,
		delta,
		maskActive,
		camera,
		lights,
		clearColor
	) {
		camera = camera || this.goo.Renderer.mainCamera;
		if (!camera) { return; }

		renderer.render(this.renderList, camera, lights, this.depthTarget, this.clear, this.depthMaterial);
		renderer.render(this.renderList, camera, lights, this.colorTarget, this.clear);

		this.material.setTexture('DIFFUSE_MAP', this.colorTarget);
		this.material.setTexture('DEPTH_MAP', this.depthTarget);
		if (this.renderToScreen) {
			renderer.render(this.renderable, this.fullscreenCamera, [], null, this.clear);
		} else {
			renderer.render(this.renderable, this.fullscreenCamera, [], writeBuffer, this.clear);
		}
	};

	var depthShaderDef = function (goo) {
		return {
			processors: [
				goo.ShaderBuilder.animation.processor
			],
			defines: {
				WEIGHTS: true,
				JOINTIDS: true
			},
			attributes : {
				vertexPosition : goo.MeshData.POSITION,
        vertexJointIDs: goo.MeshData.JOINTIDS,
        vertexWeights: goo.MeshData.WEIGHTS
			},
			uniforms : {
				viewMatrix : goo.Shader.VIEW_MATRIX,
				projectionMatrix : goo.Shader.PROJECTION_MATRIX,
				worldMatrix : goo.Shader.WORLD_MATRIX,
				farPlane : goo.Shader.FAR_PLANE,
				focalDistance: 5.0,
				focalLength: 85.0,
				fStop: 5.6,
				maxBlur: 10
			},
			vshader : [
				'attribute vec3 vertexPosition;',
	
				'uniform mat4 viewMatrix;',
				'uniform mat4 projectionMatrix;',
				'uniform mat4 worldMatrix;',
	
				'varying vec4 vPosition;',
	
				goo.ShaderBuilder.animation.prevertex,
				'void main(void) {',
				' mat4 wMatrix = worldMatrix;',
				goo.ShaderBuilder.animation.vertex,
				' vec4 worldPos = wMatrix * vec4(vertexPosition, 1.0);',
				'	vPosition = viewMatrix * worldPos;',
				'	gl_Position = projectionMatrix * vPosition;',
				'}'//
			].join('\n'),
			fshader : [//
				'uniform float farPlane;',
	
				'uniform float focalDistance;',
				'uniform float focalLength;',
				'uniform float fStop;',
				'uniform float maxBlur;',
	
				'const float CoC = 0.03;//circle of confusion size in mm (35mm film = 0.03mm)', 
				goo.ShaderFragment.methods.packDepth16,
	
				'varying vec4 vPosition;',
	
				'void main(void)',
				'{',
				'	float depth = - min(vPosition.z, farPlane);',
				'	gl_FragColor.rg = packDepth16(depth / farPlane);',
	
				'	float blur = 0.0;', 
				'	float f = focalLength; //focal length in mm', 
				'	float fPlane = focalDistance * 1000.0; //focal plane in mm', 
				'	float mDepth = depth * 1000.0; //depth in mm', 
		
				'	float a = (mDepth * focalLength) / (mDepth - focalLength);', 
				'	float b = (fPlane * focalLength) / (fPlane - focalLength);', 
				'	float c = (fPlane - focalLength) / (fPlane * fStop * CoC);', 
		
				'	blur = clamp(abs(a - b) * c, 0.0, maxBlur);',
				' gl_FragColor.ba = packDepth16(blur / maxBlur);',
				'}'//
			].join('\n')
		}
	};


	var dofShaderDef = function (goo) {
		return {
			attributes : {
				vertexPosition : goo.MeshData.POSITION,
				vertexUV0 : goo.MeshData.TEXCOORD0
			},
			uniforms : {
				viewMatrix : goo.Shader.VIEW_MATRIX,
				projectionMatrix : goo.Shader.PROJECTION_MATRIX,
				worldMatrix : goo.Shader.WORLD_MATRIX,
				depthBlurMap : goo.Shader.DEPTH_MAP,
				diffuseMap : goo.Shader.DIFFUSE_MAP,
				resolution: goo.Shader.RESOLUTION,
				zfar : goo.Shader.FAR_PLANE,
				kernel: [-0.326212, -0.40581, 0.5206688247283487,
					-0.840144, -0.07358, 0.8433599214665113,
					-0.695914, 0.457137, 0.8326286880506821,
					-0.203345, 0.620716, 0.6531749701886931,
					0.96234, -0.194983, 0.9818944168743399,
					0.473434, -0.480026, 0.6742141447878411,
					0.519456, 0.767022, 0.9263677911175453,
					0.185461, -0.893124, 0.912176661561235,
					0.507431, 0.064425, 0.511504448060816,
					0.89642, 0.412458, 0.986757527543621,
					-0.32194, -0.932615, 0.9866185188942076,
					-0.791559, -0.59771, 0.9918784676466165
				],
				fStop: 5.6,
				maxBlur: 10,
				vignetting: false,
				vignout: 1.3,
				vignin: 0.0,
				vignfade: 22.0,
				threshold: 0.0,
				gain: 0.0,
				bias: 1.0,
				fringe: 0.0,
				noise: true,
				namount: 0.00001,
				colorBleed: false
			},
			vshader : [
			'attribute vec3 vertexPosition;', 
			'attribute vec2 vertexUV0;', 

			'uniform mat4 viewMatrix;', 
			'uniform mat4 projectionMatrix;',
			'uniform mat4 worldMatrix;',

			'varying vec2 texCoord0;',

			'void main(void) {', 
			'	texCoord0 = vertexUV0;',
			'	gl_Position = projectionMatrix * viewMatrix * worldMatrix * vec4(vertexPosition, 1.0);', 
			'}'
			].join('\n'),
			fshader : [
			/*
			'DoF with bokeh GLSL shader v2.4', 
			'by Martins Upitis (martinsh) (devlog-martinsh.blogspot.com)', 
			*/
			'uniform sampler2D diffuseMap;', 
			'uniform sampler2D depthBlurMap;', 
			'uniform vec2 resolution;',
			'uniform float maxBlur;',
			'uniform vec3 kernel[12];',
			'uniform float fStop;',

			'#define PI  3.14159265', 

			'float width = resolution.x; //texture width', 
			'float height = resolution.y; //texture height', 

			'vec2 texel = vec2(1.0/width,1.0/height);', 

			'//uniform variables from external script', 

			'/* ', 
			'make sure that these two values are the same for your camera, otherwise distances will be wrong.', 
			'*/', 

			'uniform float zfar; //camera clipping end', 

			'varying vec2 texCoord0;', 

			'uniform bool colorBleed;',
			'uniform bool vignetting; //use optical lens vignetting?', 
			'uniform float vignout; //vignetting outer border', 
			'uniform float vignin; //vignetting inner border', 
			'uniform float vignfade; //f-stops till vignete fades', 
			'uniform float threshold; //highlight threshold;', 
			'uniform float gain; //highlight gain;', 

			'uniform float bias; //bokeh edge bias', 
			'uniform float fringe; //bokeh chromatic aberration/fringing', 

			'uniform bool noise; //use noise instead of pattern for sample dithering', 
			'uniform float namount; //dither amount', 		

			goo.ShaderFragment.methods.unpackDepth16, 

			'vec3 color(vec2 coords,float blur) { //processing the sample', 
			'	vec3 col = vec3(0.0);', 
			'	col.r = texture2D(diffuseMap, coords + vec2(0.0,1.0)*texel*fringe*blur).r;', 
			'	col.g = texture2D(diffuseMap, coords + vec2(-0.866,-0.5)*texel*fringe*blur).g;', 
			'	col.b = texture2D(diffuseMap, coords + vec2(0.866,-0.5)*texel*fringe*blur).b;', 

			'	vec3 lumcoeff = vec3(0.299,0.587,0.114);', 
			'	float lum = dot(col.rgb, lumcoeff);', 
			'	float thresh = max((lum-threshold)*gain, 0.0);', 
			'	return col+mix(vec3(0.0),col,thresh*blur/maxBlur);', 
			'}', 

			'vec2 rand(vec2 coord) { //generating noise/pattern texture for dithering', 
			'	float noiseX = ((fract(1.0-coord.s*(width/2.0))*0.25)+(fract(coord.t*(height/2.0))*0.75))*2.0-1.0;', 
			'	float noiseY = ((fract(1.0-coord.s*(width/2.0))*0.75)+(fract(coord.t*(height/2.0))*0.25))*2.0-1.0;', 

			'	if (noise) {', 
			'		noiseX = clamp(fract(sin(dot(coord ,vec2(12.9898,78.233))) * 43758.5453),0.0,1.0)*2.0-1.0;', 
			'		noiseY = clamp(fract(sin(dot(coord ,vec2(12.9898,78.233)*2.0)) * 43758.5453),0.0,1.0)*2.0-1.0;', 
			'	}', 
			'	return vec2(noiseX,noiseY);', 
			'}', 

			'float vignette() {', 
			'	float dist = distance(texCoord0, vec2(0.5,0.5));', 
			'	dist = smoothstep(vignout+(fStop/vignfade), vignin+(fStop/vignfade), dist);', 
			'	return clamp(dist,0.0,1.0);', 
			'}',


			'void main() {', 
			'	// scene depth calculation', 
			'	float depth = unpackDepth16(texture2D(depthBlurMap,texCoord0).rg) * zfar;', 
			' float blur = unpackDepth16(texture2D(depthBlurMap,texCoord0).ba) * maxBlur;',
			
			'	// calculation of pattern for dithering', 
			'	vec2 noise = rand(texCoord0)*namount*blur;', 
			'	// getting blur x and y step factor',
			' vec2 scale = blur * vec2(1.0 / width, 1.0 / height) + noise;',

			'	// calculation of final color', 

			'	vec3 col = vec3(0.0);', 
			' col = texture2D(diffuseMap, texCoord0).rgb;',

			'	if (blur > 0.03) {',
			'		float totalContribution = 1.0;',
			'		for (int i = 0; i < 12; i += 1) {',
			'			vec2 tapCoord = texCoord0 + scale * kernel[i].xy;',
			'			vec4 tapTex = texture2D(depthBlurMap, tapCoord);',
			'			float tapDepth = unpackDepth16(tapTex.rg) * zfar;',
			' 		float biasMix = 1.0 + (kernel[i].z - 0.5) * bias;',
			'			vec3 tapColor = color(tapCoord, blur) * biasMix;',
			'			if (tapDepth < depth && !colorBleed) {',
			'				float tapContribution = unpackDepth16(tapTex.ba);',
			'				tapColor *= tapContribution;',
			'				totalContribution += tapContribution * biasMix;',
			'			} else {',
			'				totalContribution += 1.0 * biasMix;',
			'			}',
			'			col += tapColor;',

			'		}', 
			'		col /= totalContribution;', 
			'	}', 

			'	if (vignetting) {', 
			'		col *= vignette();', 
			'	}', 

			'	gl_FragColor.rgb = col;', 
			'	gl_FragColor.a = 1.0;', 
			'}'
			].join('\n')
		};
	};

	window.DOFRenderPass = DOFRenderPass;
}());