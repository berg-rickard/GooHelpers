'use strict';
(function(global) {
	var originalPass = null;
	var originalComposer = null;
	var addedPass = null;
	
	var PassSwitcher = {
		switchPass: function(pass, ctx, goo) {
			addedPass = pass;
			var renderSystem = ctx.world.getSystem('RenderSystem');
			// Get or create composer
			var composer
			if (renderSystem.composers.length) {
				composer = renderSystem.composers[0];
				originalPass = composer.passes.shift();
				pass.renderToScreen = false;
			} else {
				originalComposer = composer = new goo.Composer();
				renderSystem.composers.push(composer);
				pass.renderToScreen = true;
			}
			// Add the post effect
			composer.passes.unshift(pass);
			if (composer.size) {
				if (pass.updateSize instanceof Function) {
					pass.updateSize(composer.size, ctx.world.gooRunner.renderer);
				}
				pass.viewportSize = composer.size;
			}
		},
		switchBack: function(ctx, goo) {
			var renderSystem = ctx.world.getSystem('RenderSystem');
			if (originalComposer) {
				originalComposer.destroy(ctx.world.gooRunner.renderer)
				// If we created a post effect chain, remove it
				goo.ArrayUtil.remove(renderSystem.composers, originalComposer);
			} else {
				// Otherwise, remove the post effect and put back the outpass
				var composer = renderSystem.composers[0];
				if (addedPass) {
					addedPass.destroy(ctx.world.gooRunner.renderer)
				}
				goo.ArrayUtil.remove(composer.passes, addedPass);
				composer.passes.unshift(originalPass);
			}
		}
	};
	global.PassSwitcher = PassSwitcher;
}(window));