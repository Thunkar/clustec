/**
 * Clustec logo: the Aztec "A" silhouette with scattered cluster dots overlay.
 * The A is clearly visible; dots add a "data clustering" accent.
 */
export function ClustecLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 300 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* A silhouette — primary visual */}
      <path
        d="M140.334 156.685L216.575 76.4643C215.739 88.5785 214.903 110.729 214.48 133.701L214.056 167.966C211.538 170.055 206.513 172.145 202.323 172.145C197.297 172.145 191.013 171.722 170.487 165.454C160.849 162.531 151.221 159.608 140.323 156.685H140.334ZM165.05 203.908C177.195 203.908 192.695 196.384 214.056 176.746L212.797 261.979C212.797 277.016 232.063 299.166 244.633 299.166C252.589 299.166 264.322 290.809 278.986 272.426L293.227 254.455L288.202 249.854L284.848 253.61C280.658 258.211 276.892 260.301 273.537 260.301C266.417 260.301 257.614 246.931 257.614 235.228L259.286 31.7526L285.26 4.17883L281.07 -7.62939e-06L251.742 27.5738L212.786 15.4596C189.742 8.35772 172.571 3.34528 165.027 3.34528C154.976 3.34528 135.287 14.626 117.692 32.175L74.123 75.2084L109.725 111.562L145.75 75.2084L123.553 53.9029C108.889 40.1104 136.122 32.175 149.94 36.7762L219.483 60.1711L129.838 154.184C113.502 150.006 98.8381 146.66 90.4586 146.66C74.123 146.66 47.313 161.286 19.2439 185.937L5.00319 198.474L10.4521 204.742L18.4082 197.64C30.1417 187.193 41.4518 180.513 52.7619 180.513C59.47 180.513 69.9332 182.181 89.2106 187.615C92.1412 188.449 95.4952 189.282 98.8492 190.127L0 294.143L5.8612 299.989L18.007 287.452C22.6202 282.851 28.058 279.928 34.766 279.928C50.6893 279.928 90.0574 299.144 108.076 299.144C117.291 299.144 127.342 292.454 139.075 276.583L157.929 251.51L152.904 247.331L144.524 256.522C139.911 261.534 135.732 264.046 130.696 264.046C117.714 264.046 86.7145 248.164 72.8861 248.164C66.6015 248.164 59.4811 250.254 49.4302 255.689L108.911 193.017C129.437 198.451 154.152 203.875 165.05 203.875V203.908Z"
        fill="#7c6cff"
        opacity="0.45"
      />
      {/* Cluster dot accents — sparse, along key points of the A */}
      {/* Apex */}
      <circle cx="260" cy="30" r="8" fill="#7c6cff" opacity="0.8" />
      <circle cx="275" cy="10" r="6" fill="#ff6c8c" opacity="0.7" />
      {/* Upper left arm */}
      <circle cx="148" cy="30" r="9" fill="#ff6c8c" opacity="0.7" />
      <circle cx="120" cy="58" r="7" fill="#4cda8c" opacity="0.7" />
      <circle cx="92" cy="85" r="6" fill="#ffc66c" opacity="0.6" />
      {/* Left crossing */}
      <circle cx="110" cy="112" r="9" fill="#7c6cff" opacity="0.7" />
      {/* Right diagonal */}
      <circle cx="216" cy="80" r="9" fill="#7c6cff" opacity="0.7" />
      <circle cx="212" cy="130" r="7" fill="#4cda8c" opacity="0.6" />
      {/* Crossbar */}
      <circle cx="168" cy="162" r="8" fill="#ff6c8c" opacity="0.7" />
      <circle cx="140" cy="155" r="9" fill="#4cda8c" opacity="0.65" />
      {/* Right descender */}
      <circle cx="213" cy="205" r="7" fill="#ff6c8c" opacity="0.6" />
      <circle cx="213" cy="250" r="9" fill="#ffc66c" opacity="0.7" />
      {/* Right tail */}
      <circle cx="270" cy="262" r="7" fill="#4cda8c" opacity="0.6" />
      <circle cx="240" cy="290" r="8" fill="#7c6cff" opacity="0.7" />
      {/* Lower left */}
      <circle cx="35" cy="192" r="9" fill="#ffc66c" opacity="0.7" />
      <circle cx="70" cy="165" r="7" fill="#ff6c8c" opacity="0.6" />
      {/* Bottom left */}
      <circle cx="90" cy="190" r="7" fill="#7c6cff" opacity="0.6" />
      <circle cx="25" cy="282" r="8" fill="#7c6cff" opacity="0.7" />
      <circle cx="10" cy="295" r="6" fill="#ff6c8c" opacity="0.6" />
      {/* Bottom center */}
      <circle cx="130" cy="212" r="7" fill="#ff6c8c" opacity="0.6" />
      <circle cx="165" cy="205" r="9" fill="#ffc66c" opacity="0.65" />
      {/* Bottom tail */}
      <circle cx="140" cy="268" r="7" fill="#7c6cff" opacity="0.6" />
      <circle cx="108" cy="295" r="6" fill="#ffc66c" opacity="0.6" />
    </svg>
  );
}
