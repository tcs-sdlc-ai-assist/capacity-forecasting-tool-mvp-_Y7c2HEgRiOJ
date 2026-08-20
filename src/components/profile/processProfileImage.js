const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_SIZE = 256;

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
      return;
    }

    reject(new Error('The selected image could not be read.'));
  };

  reader.onerror = () => {
    reject(new Error('The selected image could not be read.'));
  };

  reader.readAsDataURL(file);
});

const loadImage = (dataUrl) => new Promise((resolve, reject) => {
  const image = document.createElement('img');

  image.onload = () => resolve(image);
  image.onerror = () => {
    reject(new Error('The selected file is not a usable image.'));
  };
  image.src = dataUrl;
});

const resizeImage = (image) => {
  const canvas = document.createElement('canvas');
  const sourceSize = Math.min(image.width, image.height);

  if (!Number.isFinite(sourceSize) || sourceSize <= 0) {
    throw new Error('The selected file is not a usable image.');
  }

  const outputSize = Math.min(PROFILE_AVATAR_SIZE, sourceSize);
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('The selected image could not be prepared.');
  }

  const offsetX = (image.width - sourceSize) / 2;
  const offsetY = (image.height - sourceSize) / 2;

  context.drawImage(
    image,
    offsetX,
    offsetY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  );

  return canvas.toDataURL('image/jpeg', 0.85);
};

/**
 * Validates and resizes an image file into a square profile photo data URL.
 *
 * @param {File} file Selected image file.
 * @returns {Promise<string>} JPEG data URL for the profile photo.
 */
export const processProfileImage = async (file) => {
  if (!(file instanceof File)) {
    throw new Error('Choose an image file to use as a profile photo.');
  }

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Use a JPEG, PNG, GIF, or WebP image.');
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);

  return resizeImage(image);
};

export default processProfileImage;
