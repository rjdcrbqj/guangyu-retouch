const TEXT_FONT = '600 64px system-ui, sans-serif';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 水印使用最终照片坐标，位置不随透视、液化或分块改变。
export function watermarkRectangle(width, height, assetWidth, assetHeight, options) {
  const shortEdge = Math.min(width, height);
  const size = shortEdge * clamp(options.size, 1, 80) / 100;
  const scale = Math.min(size / Math.max(assetWidth, assetHeight), width * .8 / assetWidth, height * .8 / assetHeight);
  const drawnWidth = assetWidth * scale;
  const drawnHeight = assetHeight * scale;
  const margin = shortEdge * .04;
  const position = options.position;
  const x = position === 'center' ? (width - drawnWidth) / 2
    : position.endsWith('right') ? width - margin - drawnWidth : margin;
  const y = position === 'center' ? (height - drawnHeight) / 2
    : position.startsWith('bottom') ? height - margin - drawnHeight : margin;
  return {x, y, width: drawnWidth, height: drawnHeight};
}

export function drawOutputWatermark(context, canvas, options) {
  if (!options || options.opacity <= 0 || (!options.image && !options.text?.trim())) return false;
  const {width, height} = canvas;
  context.save();
  try {
    context.globalAlpha = clamp(options.opacity, 0, 100) / 100;
    context.imageSmoothingEnabled = true;
    if (options.image) {
      const image = options.image;
      const rectangle = watermarkRectangle(width, height, image.width, image.height, options);
      context.drawImage(image, rectangle.x, rectangle.y, rectangle.width, rectangle.height);
    } else {
      context.font = TEXT_FONT;
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      const metrics = context.measureText(options.text);
      const left = metrics.actualBoundingBoxLeft || 0;
      const ascent = metrics.actualBoundingBoxAscent;
      const textWidth = Math.max(1, metrics.actualBoundingBoxRight + left);
      const textHeight = Math.max(1, ascent + metrics.actualBoundingBoxDescent);
      const rectangle = watermarkRectangle(width, height, textWidth, textHeight, options);
      context.translate(rectangle.x, rectangle.y);
      context.scale(rectangle.width / textWidth, rectangle.height / textHeight);
      context.fillStyle = options.color;
      context.fillText(options.text, left, ascent);
    }
    return true;
  } finally {
    context.restore();
  }
}
