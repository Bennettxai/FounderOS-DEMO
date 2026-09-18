import * as simpleIcons from 'simple-icons';

/**
 * Brand marks for the connections marketplace. Three sources, in order:
 *   1. HANDMADE  — full-colour SVGs for brands simple-icons dropped (Slack) or
 *      where we want the real multi-colour logo.
 *   2. simple-icons — the canonical single-colour glyph + official brand hex,
 *      looked up by slug (`gmail` -> `siGmail`, `googlecalendar` -> ...).
 *   3. LETTERMARK — an intentional coloured initial tile for niche brands with
 *      no logo in either source (Attio, Beehiiv, our own aliases).
 * A slug that matches none of the three is a typo — `hasBrandMark` returns
 * false so the catalog test catches it.
 */

type SiIcon = { title: string; hex: string; path: string };

// slug -> { viewBox, node } for hand-authored multi-colour marks.
const HANDMADE: Record<string, { viewBox: string; node: React.ReactNode }> = {
  slack: {
    viewBox: '0 0 122.8 122.8',
    node: (
      <>
        <path
          d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z"
          fill="#E01E5A"
        />
        <path
          d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z"
          fill="#36C5F0"
        />
        <path
          d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z"
          fill="#2EB67D"
        />
        <path
          d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z"
          fill="#ECB22E"
        />
      </>
    ),
  },
};

// Real brand marks pulled from each vendor (svgl.app + official site favicons),
// sanitized and with gradient/clip IDs namespaced so two marks can't collide.
// `mono` marks carry no brand colour and render in the board foreground (a light
// glyph on the dark tile); colour marks render exactly as authored.
const VECTOR: Record<string, { viewBox: string; mono: boolean; svg: string }> = {
  openai: {
    viewBox: '0 0 256 260',
    mono: true,
    svg: `<path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"/>`,
  },
  manychat: {
    viewBox: '0 0 256 256',
    mono: true,
    svg: `<path d="M216.682 32.0478H214.916C162.69 32.0478 137.305 110.184 137.305 110.184V50.2282H0V215.018H54.8745V105.15H84.1489V215.018H143.031C143.031 215.018 173.284 84.6083 201.604 94.3664C220.691 101.524 166.866 214.899 166.866 214.899H244.62C244.62 214.899 255.404 141.057 255.571 115.505C257.957 72.1061 251.11 32 216.635 32"/>`,
  },
  plaid: {
    viewBox: '0 0 512 512',
    mono: true,
    svg: `<path d="m1436 4511c-407-105-653-173-658-182-4-8-82-306-173-663l-166-650 228-228 228-228-228-228-228-228 167-655c92-360 172-659 178-665s305-86 665-178l655-167 228 228 228 228 228-228 228-228 655 167c360 92 659 172 665 178s86 305 178 665l167 655-228 228-228 228 228 228 228 228-167 655c-92 360-172 659-178 665s-305 86-665 178l-655 167-228-228-228-228-228 228c-125 125-232 227-237 226-6 0-302-76-659-168zm714-406 145-145-218-218-217-217-275 275c-151 151-273 276-271 278 6 6 650 170 671 171 13 1 70-49 165-144zm1309 65c174-45 324-84 334-88 14-6-37-61-258-282l-275-275-217 217-218 218 145 145c80 80 151 145 158 145 8 0 157-36 331-80zm-2082-1127-217-218-147 148-148 147 79 313c44 171 84 327 89 346l9 34 276-276 277-277zm2794 410 84-333-148-147-147-148-217 218-218 217 275 275c170 170 277 270 281 262 3-6 44-162 90-344zm-1391 22 215-215-218-218-217-217-217 217-218 218 215 215c118 118 217 215 220 215s102-97 220-215zm-700-700 215-215-218-218-217-217-217 217-218 218 215 215c118 118 217 215 220 215s102-97 220-215zm1400 0 215-215-218-218-217-217-217 217-218 218 215 215c118 118 217 215 220 215s102-97 220-215zm-2100-700 215-215-275-275c-170-170-277-270-281-262-3 6-44 162-90 344l-84 333 145 145c80 80 147 145 150 145s102-97 220-215zm1400 0 215-215-218-218-217-217-217 217-218 218 215 215c118 118 217 215 220 215s102-97 220-215zm1330 70 145-145-84-333c-46-182-87-338-90-344-4-8-111 92-281 262l-275 275 215 215c118 118 217 215 220 215s70-65 150-145zm-2030-770 215-215-148-148-147-147-313 79c-171 44-327 84-346 89l-34 9 274 274c151 151 276 274 279 274s102-97 220-215zm1459-59 274-274-34-9c-19-5-175-45-346-89l-313-79-147 147-148 148 215 215c118 118 217 215 220 215s128-123 279-274z" transform="matrix(.1 0 0 -.1 0 512)"/>`,
  },
  zernio: {
    viewBox: '0 0 1000 1000',
    mono: false,
    svg: `<rect width="1000" height="1000" rx="161.29" fill="#EB3514"/> <path d="M253.803 294.019L253.803 478.63L540.935 403.248C576.717 393.854 609.198 426.823 599.272 462.46L519.204 749.918L702.287 749.918L740.228 563.688C743.395 548.144 738.664 532.039 727.593 520.677L483.105 269.754C471.726 258.076 455.189 252.984 439.212 256.24L253.803 294.019Z" fill="white"/>`,
  },
  canva: {
    viewBox: '0 0 80 80',
    mono: false,
    svg: `<g clip-path="url(#cv_clip0_905_1790)"> <path d="M40 80C62.0914 80 80 62.0914 80 40C80 17.9086 62.0914 0 40 0C17.9086 0 0 17.9086 0 40C0 62.0914 17.9086 80 40 80Z" fill="#7D2AE7"/> <path d="M40 80C62.0914 80 80 62.0914 80 40C80 17.9086 62.0914 0 40 0C17.9086 0 0 17.9086 0 40C0 62.0914 17.9086 80 40 80Z" fill="url(#cv_paint0_radial_905_1790)"/> <path d="M40 80C62.0914 80 80 62.0914 80 40C80 17.9086 62.0914 0 40 0C17.9086 0 0 17.9086 0 40C0 62.0914 17.9086 80 40 80Z" fill="url(#cv_paint1_radial_905_1790)"/> <path d="M40 80C62.0914 80 80 62.0914 80 40C80 17.9086 62.0914 0 40 0C17.9086 0 0 17.9086 0 40C0 62.0914 17.9086 80 40 80Z" fill="url(#cv_paint2_radial_905_1790)"/> <path d="M40 80C62.0914 80 80 62.0914 80 40C80 17.9086 62.0914 0 40 0C17.9086 0 0 17.9086 0 40C0 62.0914 17.9086 80 40 80Z" fill="url(#cv_paint3_radial_905_1790)"/> <path d="M57.2691 48.2052C56.939 48.2052 56.6485 48.484 56.3462 49.0928C52.9323 56.0153 47.0358 60.9134 40.2125 60.9134C32.3228 60.9134 27.437 53.7913 27.437 43.9522C27.437 27.2855 36.7232 17.6491 44.8796 17.6491C48.691 17.6491 51.0186 20.0443 51.0186 23.8559C51.0186 28.3796 48.4485 30.7748 48.4485 32.3702C48.4485 33.0864 48.8939 33.5201 49.7773 33.5201C53.3264 33.5201 57.4918 29.4419 57.4918 23.6808C57.4918 18.0947 52.63 13.9888 44.4737 13.9888C30.994 13.9888 19.0142 26.4858 19.0142 43.777C19.0142 57.1614 26.6572 66.0061 38.45 66.0061C50.9668 66.0061 58.2043 53.5526 58.2043 49.5105C58.2043 48.6153 57.7466 48.2052 57.2691 48.2052Z" fill="white"/> </g> <defs> <radialGradient id="cv_paint0_radial_905_1790" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(15.453 70.9057) rotate(-49.416) scale(61.8733)"> <stop stop-color="#6420FF"/> <stop offset="1" stop-color="#6420FF" stop-opacity="0"/> </radialGradient> <radialGradient id="cv_paint1_radial_905_1790" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(21.1788 9.09457) rotate(54.703) scale(69.7735)"> <stop stop-color="#00C4CC"/> <stop offset="1" stop-color="#00C4CC" stop-opacity="0"/> </radialGradient> <radialGradient id="cv_paint2_radial_905_1790" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(15.4526 70.9053) rotate(-45.1954) scale(61.1242 28.1118)"> <stop stop-color="#6420FF"/> <stop offset="1" stop-color="#6420FF" stop-opacity="0"/> </radialGradient> <radialGradient id="cv_paint3_radial_905_1790" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32.7158 10.7789) rotate(66.5198) scale(62.9836 105.512)"> <stop stop-color="#00C4CC" stop-opacity="0.725916"/> <stop offset="0.0001" stop-color="#00C4CC"/> <stop offset="1" stop-color="#00C4CC" stop-opacity="0"/> </radialGradient> <clipPath id="cv_clip0_905_1790"> <rect width="80" height="80" fill="white"/> </clipPath> </defs>`,
  },
  onedrive: {
    viewBox: '0 0 1000 615',
    mono: false,
    svg: `<defs><radialGradient id="od_a" cx="-446.23" cy="850.24" r="6.99" data-name="Безымянный градиент" fx="-446.23" fy="850.24" gradientTransform="matrix(28.87975 32.00675 53.69646 -48.39975 -32750.77 55564.7)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4894fe"/><stop offset=".7" stop-color="#0934b3"/></radialGradient><radialGradient id="od_b" cx="-463.71" cy="855.09" r="6.99" data-name="Безымянный градиент 2" fx="-463.71" fy="855.09" gradientTransform="matrix(-126.93754 135.45874 101.23704 94.7798 -144561.83 -18444.24)" gradientUnits="userSpaceOnUse"><stop offset=".17" stop-color="#23c0fe"/><stop offset=".53" stop-color="#1c91ff"/></radialGradient><radialGradient id="od_c" cx="-478.67" cy="847.12" r="6.99" data-name="Безымянный градиент 3" fx="-478.67" fy="847.12" gradientTransform="matrix(-30.17956 -23.43498 -52.80172 67.93278 30509.91 -68620.88)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset=".66" stop-color="#adc0ff" stop-opacity="0"/></radialGradient><radialGradient id="od_d" cx="-484.89" cy="847.31" r="6.99" data-name="Безымянный градиент 4" fx="-484.89" fy="847.31" gradientTransform="matrix(-33.90072 -26.53382 -39.69188 50.66325 17714.49 -55348.26)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#033acc"/><stop offset="1" stop-color="#368eff" stop-opacity="0"/></radialGradient><radialGradient id="od_e" cx="-454.42" cy="853.18" r="6.99" data-name="Безымянный градиент 5" fx="-454.42" fy="853.18" gradientTransform="matrix(38.74213 82.7056 94.03873 -44.01576 -62416.51 75114.97)" gradientUnits="userSpaceOnUse"><stop offset=".59" stop-color="#3464e3" stop-opacity="0"/><stop offset="1" stop-color="#033acc"/></radialGradient><radialGradient id="od_f" cx="-465.3" cy="852.63" r="6.99" data-name="Безымянный градиент 6" fx="-465.3" fy="852.63" gradientTransform="matrix(-101.35519 93.7574 146.5162 158.24743 -171232.53 -91444.13)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4bfde8"/><stop offset=".54" stop-color="#4bfde8" stop-opacity="0"/></radialGradient><radialGradient id="od_h" cx="-445.42" cy="847.35" r="6.99" data-name="Безымянный градиент 8" fx="-445.42" fy="847.35" gradientTransform="matrix(60.3777 22.14291 39.59688 -107.87213 -6264.92 101508.79)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset=".79" stop-color="#fff" stop-opacity="0"/></radialGradient><radialGradient id="od_i" cx="-468.67" cy="861.39" r="6.99" data-name="Безымянный градиент 9" fx="-468.67" fy="861.39" gradientTransform="matrix(-67.45933 53.77501 53.21816 66.68832 -76468.45 -32083.78)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4bfde8"/><stop offset=".58" stop-color="#4bfde8" stop-opacity="0"/></radialGradient><linearGradient id="od_g" x1="638.67" x2="638.67" y1="2.44" y2="421.76" data-name="Безымянный градиент 7" gradientTransform="matrix(1 0 0 -1 0 617.01)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0086ff"/><stop offset=".49" stop-color="#0bf"/></linearGradient></defs><path d="M276.36 94.08C123.48 94.08 9.21 209.84.6 338.79c5.33 27.79 22.83 82.65 50.24 79.84 34.26-3.52 120.56 0 194.17-123.26 53.77-90.04 164.37-201.29 31.35-201.29Z" style="fill:url(#od_a)"/><path d="M240.99 142.19c-51.39 75.26-120.56 183.1-143.91 217.03-27.75 40.34-101.25 23.2-95.16-34.62a237.4 237.4 0 0 0-1.38 14.19C-9.51 489.22 119.43 614.14 279.88 614.14c176.84 0 598.58-203.81 555.9-408.02C790.8 86.1 664.36 0 521.07 0S285.94 76.36 241 142.19Z" style="fill:url(#od_b)"/><path d="M240.99 142.19c-51.39 75.26-120.56 183.1-143.91 217.03-27.75 40.34-101.25 23.2-95.16-34.62a237.4 237.4 0 0 0-1.38 14.19C-9.51 489.22 119.43 614.14 279.88 614.14c176.84 0 598.58-203.81 555.9-408.02C790.8 86.1 664.36 0 521.07 0S285.94 76.36 241 142.19Z" style="fill-opacity:.4;fill:url(#od_c)"/><path d="M240.99 142.19c-51.39 75.26-120.56 183.1-143.91 217.03-27.75 40.34-101.25 23.2-95.16-34.62a237.4 237.4 0 0 0-1.38 14.19C-9.51 489.22 119.43 614.14 279.88 614.14c176.84 0 598.58-203.81 555.9-408.02C790.8 86.1 664.36 0 521.07 0S285.94 76.36 241 142.19Z" style="fill:url(#od_d)"/><path d="M240.99 142.19c-51.39 75.26-120.56 183.1-143.91 217.03-27.75 40.34-101.25 23.2-95.16-34.62a237.4 237.4 0 0 0-1.38 14.19C-9.51 489.22 119.43 614.14 279.88 614.14c176.84 0 598.58-203.81 555.9-408.02C790.8 86.1 664.36 0 521.07 0S285.94 76.36 241 142.19Z" style="fill:url(#od_e);fill-opacity:.6"/><path d="M240.99 142.19c-51.39 75.26-120.56 183.1-143.91 217.03-27.75 40.34-101.25 23.2-95.16-34.62a237.4 237.4 0 0 0-1.38 14.19C-9.51 489.22 119.43 614.14 279.88 614.14c176.84 0 598.58-203.81 555.9-408.02C790.8 86.1 664.36 0 521.07 0S285.94 76.36 241 142.19Z" style="fill-opacity:.9;fill:url(#od_f)"/><path d="M277.34 614.23s422.24.77 493.86.77c129.97 0 228.8-98.16 228.8-212.69s-100.8-212.1-228.8-212.1-201.7 88.57-257.06 185.25c-64.87 113.29-147.62 237.41-236.8 238.77Z" style="fill:url(#od_g)"/><path d="M277.34 614.23s422.24.77 493.86.77c129.97 0 228.8-98.16 228.8-212.69s-100.8-212.1-228.8-212.1-201.7 88.57-257.06 185.25c-64.87 113.29-147.62 237.41-236.8 238.77Z" style="fill:url(#od_h);fill-opacity:.4"/><path d="M277.34 614.23s422.24.77 493.86.77c129.97 0 228.8-98.16 228.8-212.69s-100.8-212.1-228.8-212.1-201.7 88.57-257.06 185.25c-64.87 113.29-147.62 237.41-236.8 238.77Z" style="fill:url(#od_i);fill-opacity:.9"/>`,
  },
};

// Brands whose only usable mark is a raster: their vendor ships no clean vector
// icon (wordmark or PNG favicon only), so we vendor the official mark locally
// under /public/logos and render it as an <img>. slug -> public path.
const RASTER: Record<string, string> = {
  beehiiv: '/logos/beehiiv.png', // beehiiv.com master, 999px downscaled to 128
  attio: '/logos/attio.png', // attio.com favicon (32px, native)
  gohighlevel: '/logos/gohighlevel.png', // gohighlevel.com favicon (32px, native)
  docusign: '/logos/docusign.png', // docusign.com favicon (48px, native)
};

// Brands we intentionally render as a coloured initial (no logo available).
// slug -> brand hex used to tint the tile + initial.
const LETTERMARK: Record<string, string> = {
  salesforce: '#00A1E0',
  ledger: '#4A6CF7',
  postly: '#6E56CF',
  adsmith: '#FF6A3D',
  reelkit: '#10B981',
  renderly: '#F472B6',
  dmflow: '#0084FF',
  paykit: '#22C55E',
  flexpay: '#A855F7',
  recall: '#38BDF8',
  dictate: '#FFA946',
  arcads: '#FF6A3D',
  trakyo: '#EAB308',
  skool: '#E4573D',
  'proposal-gen': '#00764f',
  wispr: '#FFA946',
  plaud: '#E8E8E8', // plaud.ai is a black-and-white brand; the tint reads as its white mark on the deck
};

/** Per-account slugs that wear their parent brand's mark (second Stripe, …). */
const SI_ALIAS: Record<string, string> = {
  'stripe-vantage': 'stripe',
};

function siFor(slug: string): SiIcon | null {
  const resolved = SI_ALIAS[slug] ?? slug;
  const name = 'si' + resolved.charAt(0).toUpperCase() + resolved.slice(1);
  const icon = (simpleIcons as Record<string, SiIcon | undefined>)[name];
  return icon ?? null;
}

/** Does this slug resolve to a real brand mark (handmade, vector, simple-icons,
 *  or an intentional lettermark)? False = the slug is a typo. */
export function hasBrandMark(slug: string, name?: string): boolean {
  if (HANDMADE[slug] || VECTOR[slug] || siFor(slug) || slug in RASTER || slug in LETTERMARK)
    return true;
  return false;
}

/** Which source renders this slug — same precedence BrandLogo uses. A real logo
 *  is 'handmade' | 'vector' | 'icon' | 'raster'; 'lettermark' is the
 *  coloured-initial fallback; 'none' means a typo. Lets tests assert a brand
 *  shows a true logo. */
export type BrandMarkKind = 'handmade' | 'vector' | 'icon' | 'raster' | 'lettermark' | 'none';
export function brandMarkKind(slug: string): BrandMarkKind {
  if (HANDMADE[slug]) return 'handmade';
  if (VECTOR[slug]) return 'vector';
  if (siFor(slug)) return 'icon';
  if (slug in RASTER) return 'raster';
  if (slug in LETTERMARK) return 'lettermark';
  return 'none';
}

// Perceived luminance of a #rrggbb hex, 0..1. Dark glyphs on a dark tile need a
// lightened fill instead of the true brand colour.
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function BrandLogo({
  slug,
  name,
  size = 40,
}: {
  slug: string;
  name: string;
  size?: number;
}) {
  const radius = Math.round(size * 0.28);
  const glyph = Math.round(size * 0.56);

  const handmade = HANDMADE[slug];
  if (handmade) {
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{ width: size, height: size, borderRadius: radius, background: 'rgba(255,255,255,0.05)' }}
      >
        <svg width={glyph} height={glyph} viewBox={handmade.viewBox} aria-hidden>
          {handmade.node}
        </svg>
      </span>
    );
  }

  const vector = VECTOR[slug];
  if (vector) {
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'rgba(255,255,255,0.06)',
          color: vector.mono ? '#e6e7ea' : undefined,
        }}
      >
        <svg
          width={glyph}
          height={glyph}
          viewBox={vector.viewBox}
          fill={vector.mono ? 'currentColor' : 'none'}
          aria-hidden
          dangerouslySetInnerHTML={{ __html: vector.svg }}
        />
      </span>
    );
  }

  const icon = siFor(slug);
  if (icon) {
    const brand = `#${icon.hex}`;
    const dark = luminance(brand) < 0.22;
    const fill = dark ? '#e6e7ea' : brand;
    const tile = dark ? 'rgba(255,255,255,0.06)' : `color-mix(in srgb, ${brand} 16%, transparent)`;
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{ width: size, height: size, borderRadius: radius, background: tile }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" aria-hidden>
          <path d={icon.path} fill={fill} />
        </svg>
      </span>
    );
  }

  const raster = RASTER[slug];
  if (raster) {
    // A vendored PNG mark. Plain <img> (not next/image) on purpose: these are
    // tiny fixed-size decorative brand marks, not content photos.
    return (
      <span
        className="grid shrink-0 place-items-center"
        style={{ width: size, height: size, borderRadius: radius, background: 'rgba(255,255,255,0.06)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={raster}
          alt=""
          width={glyph}
          height={glyph}
          loading="lazy"
          decoding="async"
          style={{ width: glyph, height: glyph, objectFit: 'contain' }}
          aria-hidden
        />
      </span>
    );
  }

  // lettermark
  const brand = LETTERMARK[slug] ?? '#8a8f98';
  const initial = (name || slug).trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      className="grid shrink-0 place-items-center font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `color-mix(in srgb, ${brand} 20%, transparent)`,
        color: brand,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
