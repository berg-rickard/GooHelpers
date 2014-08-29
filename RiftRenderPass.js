'use strict';
(function() {
	function RiftRenderPass(args, ctx, goo) {
		this.goo = goo;
		this.ctx = ctx;
		
		this.camera = new goo.Camera();
		this.fullscreenCamera = goo.FullscreenUtil.camera;
		this.renderToScreen = false;
		this.clear = true;
		this.enabled = true;
		this.needsSwap = true;

		// Create eye targets
		this.updateSize({
			width: ctx.viewportWidth,
			height: ctx.viewportHeight
		});
		this.offsetVector = new goo.Vector3();
		
		// Create composit
		this.material = new goo.Material('Composit material', riftShader);
		
		
		this.renderable = {
			meshData: goo.FullscreenUtil.quad,
			materials: [this.material]
		};

		// get the renderlist
		this.renderList = ctx.world.getSystem('RenderSystem').renderList;
		this.setup(args, ctx, goo);
	}
	
	RiftRenderPass.prototype.setup = function(args) {
		var screenWidth = 8 //cm;
		var lensDistance = 4 // cm
		var lensCenterOffset = lensDistance / screenWidth - 0.5 // screen units (full width is 1);
		console.log(lensCenterOffset);
		this.material.uniforms.lensCenterOffset = [lensCenterOffset, 0];
		this.material.uniforms.aspect = 1;
		this.material.uniforms.scale = args.scale;
		this.material.uniforms.scaleIn = args.scaleIn
		this.eyeOffset = lensDistance / 200 || 0.0;
	};
	


	RiftRenderPass.prototype.updateSize = function(size) {
		this.leftTarget = new this.goo.RenderTarget(size.width, size.height);
		this.rightTarget = new this.goo.RenderTarget(size.width, size.height);
	};

	RiftRenderPass.prototype.render = function (
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
		this.camera.copy(camera);
		lights = lights || [];
		var renderList = this.renderList;
		
		// Left eye
		this.offsetVector.setv(this.camera._left).scale(this.eyeOffset);
		this.camera.translation.addv(this.offsetVector);
		this.camera.update();
		renderer.render(renderList, this.camera, lights, this.leftTarget, this.clear);
		
		// Right eye
		this.offsetVector.scale(2);
		this.camera.translation.subv(this.offsetVector);
		this.camera.update();
		renderer.render(renderList, this.camera, lights, this.rightTarget, this.clear);
		
		// Composit
		this.material.setTexture('LEFT_TEX', this.leftTarget);
		this.material.setTexture('RIGHT_TEX', this.rightTarget);
		if (this.renderToScreen) {
			renderer.render(this.renderable, this.fullscreenCamera, [], null, this.clear);
		} else {
			renderer.render(this.renderable, this.fullscreenCamera, [], writeBuffer, this.clear);
		}
	};
	
	RiftRenderPass.parameters = [{
		key: 'eyeDistance',
		type: 'float',
		min: 0.0,
		max: 0.4,
		'default': 0.1,
		control: 'slider'
	}]	
	var riftShader = {
		attributes : {
			vertexPosition : 'POSITION',
			vertexUV0 : 'TEXCOORD0'
		},
		uniforms : {
			viewMatrix: 'VIEW_MATRIX',
			projectionMatrix: 'PROJECTION_MATRIX',
			worldMatrix: 'WORLD_MATRIX',
			leftTex: 'LEFT_TEX',
			rightTex: 'RIGHT_TEX',
			lensCenterOffset: [0, 0],
			distortion: [1, 0.22, 0.24, 0],
			aspect: 1,
			scaleIn: [1,1],
			scale: [1,1]
		},
		vshader: [
			'attribute vec3 vertexPosition;',
			'attribute vec2 vertexUV0;',

			'uniform mat4 viewMatrix;',
			'uniform mat4 projectionMatrix;',
			'uniform mat4 worldMatrix;',

			'varying vec2 vUv;',
			'void main() {',
				'vUv = vertexUV0;',
				'gl_Position = projectionMatrix * viewMatrix * worldMatrix * vec4( vertexPosition, 1.0 );',
			'}'
		].join('\n'),
		fshader: [
			'uniform sampler2D leftTex;',
			'uniform sampler2D rightTex;',

			'uniform vec2 scaleIn;',
			'uniform vec2 scale;',
			'uniform vec2 lensCenterOffset;',
			'uniform vec4 distortion;',
			'uniform float aspect;',
			'uniform float fillScale;',
			
			'varying vec2 vUv;',

			'vec2 distort(vec2 texCoords, vec2 lensOffset) {',
				'vec2 lensCoords = ((texCoords * 2.0 - 1.0) - lensOffset) * scaleIn;',
				'float rSq = dot(lensCoords, lensCoords);',
				'vec4 r = vec4(1.0, rSq, rSq*rSq, rSq*rSq*rSq);',
				'vec2 newCoords = lensCoords * dot(distortion, r);',
				'newCoords.x *= 0.5;',
				'return (lensOffset + newCoords * scale) * 0.5 + 0.5;',
			'}',


			'void main(){',
				'vec2 coords = vUv;',
				'vec2 lensOffset = -lensCenterOffset;',
				'coords.x *= 2.0;',
				'if (vUv.x >= 0.5) {',
					'// Right eye',
					'coords.x -= 1.0;',
					'lensOffset = -lensOffset;',
				'}',
				'vec2 distortedCoords = distort(coords, lensOffset);',
				'vec2 clamped = clamp(distortedCoords, vec2(0.0), vec2(1.0));',
				// 'gl_FragColor = vec4(length(actualTexCoords)); return;',
				'if (!all(equal(clamped, distortedCoords))) {',
					'gl_FragColor = vec4(0, 0, 1, 1);',
				'} else {',
					'vec4 color = vec4(0.0);',
					'if (vUv.x >= 0.5) { // Right eye',
						'color = texture2D(rightTex, distortedCoords);',
					'} else {',
						'color = texture2D(leftTex, distortedCoords);',
					'}',
					'gl_FragColor = color;',
				'}',
			'}'
		].join('\n')
	};

	window.RiftRenderPass = RiftRenderPass;
}());