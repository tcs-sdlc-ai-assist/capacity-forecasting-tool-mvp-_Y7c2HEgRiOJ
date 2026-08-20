import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import profileRepository from '../repositories/profileRepository.js';

/**
 * Loads and updates the browser-local profile photo for a username.
 *
 * @param {string} username Account username.
 * @returns {{
 *   imageSrc: string|null,
 *   saveImage: Function,
 *   removeImage: Function
 * }} Profile photo state and actions.
 */
export const useProfileImage = (username) => {
  const [imageSrc, setImageSrc] = useState(null);

  useEffect(() => {
    const result = profileRepository.getImage(username);
    setImageSrc(result.ok ? result.data : null);
  }, [username]);

  const saveImage = useCallback((dataUrl) => {
    const result = profileRepository.saveImage(username, dataUrl);

    if (result.ok) {
      setImageSrc(result.data);
    }

    return result;
  }, [username]);

  const removeImage = useCallback(() => {
    const result = profileRepository.removeImage(username);

    if (result.ok) {
      setImageSrc(null);
    }

    return result;
  }, [username]);

  return {
    imageSrc,
    saveImage,
    removeImage,
  };
};

export default useProfileImage;
