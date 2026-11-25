// Script to remove black background from splash-icon.png and save as icon.png
const path = require('path');

async function removeBackground() {
  let Jimp;
  try {
    // Try jimp v1+ API (ES module default export)
    const jimpModule = require('jimp');
    Jimp = jimpModule.Jimp || jimpModule.default || jimpModule;
  } catch(e) {
    console.error('Cannot load jimp:', e.message);
    return;
  }

  const inputPath = path.join(__dirname, '../assets/images/splash-icon.png');
  const outputPath = path.join(__dirname, '../assets/images/icon.png');
  const foregroundPath = path.join(__dirname, '../assets/images/android-icon-foreground.png');

  try {
    let image;
    if (typeof Jimp.read === 'function') {
      image = await Jimp.read(inputPath);
    } else if (typeof Jimp === 'function') {
      image = await new Jimp({ input: inputPath });
    } else {
      console.error('Unknown jimp API');
      console.log('Jimp keys:', Object.keys(Jimp).slice(0, 20));
      return;
    }
    
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      
      // Remove near-black pixels (background)
      if (red < 25 && green < 25 && blue < 25) {
        this.bitmap.data[idx + 3] = 0;
      }
    });

    await image.write(outputPath);
    console.log('Saved transparent icon to:', outputPath);

    await image.write(foregroundPath);
    console.log('Saved transparent foreground to:', foregroundPath);

  } catch (err) {
    console.error('Error processing image:', err.message);
    console.error(err.stack);
  }
}

removeBackground();
