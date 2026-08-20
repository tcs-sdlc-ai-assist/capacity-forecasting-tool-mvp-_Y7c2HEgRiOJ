import PropTypes from 'prop-types';

const SIZE_CLASSES = Object.freeze({
  sm: 'h-8 w-8',
  lg: 'h-20 w-20',
});

const ICON_SIZE_CLASSES = Object.freeze({
  sm: 'h-4 w-4',
  lg: 'h-10 w-10',
});

/**
 * Renders a circular profile photo or the default user icon.
 *
 * @param {{
 *   imageSrc?: string|null,
 *   size?: 'sm'|'lg',
 *   alt?: string,
 *   className?: string
 * }} props Avatar properties.
 * @returns {import('react').ReactNode} Profile avatar.
 */
export const ProfileAvatar = ({
  imageSrc = null,
  size = 'sm',
  alt = '',
  className = '',
}) => {
  const frameClassName = [
    'grid shrink-0 place-items-center overflow-hidden rounded-full border border-teal-600 bg-teal-800 text-teal-100',
    SIZE_CLASSES[size] ?? SIZE_CLASSES.sm,
    className,
  ].filter(Boolean).join(' ');

  if (typeof imageSrc === 'string' && imageSrc) {
    return (
      <span className={frameClassName} aria-hidden={alt ? undefined : true}>
        <img
          src={imageSrc}
          alt={alt}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className={frameClassName} aria-hidden="true">
      <svg
        className={ICON_SIZE_CLASSES[size] ?? ICON_SIZE_CLASSES.sm}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
      </svg>
    </span>
  );
};

ProfileAvatar.propTypes = {
  imageSrc: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'lg']),
  alt: PropTypes.string,
  className: PropTypes.string,
};

export default ProfileAvatar;
