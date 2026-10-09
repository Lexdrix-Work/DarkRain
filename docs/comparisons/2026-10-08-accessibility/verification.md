# Accessibility verification

147 Node tests passed; TypeScript check, production build and Windows packaging passed.

Packaged WebGL2 gameplay checks passed: camera-motion zero, retained deliberate lean behavior in unit coverage, live field palette, typed detector reading, critical cues with master volume zero and captions off, bounded warning priority, subtitle size, pause during an emission, and actual offline mono downmix. Stereo left-only signal [0.5, 0] became [0.25, 0.25].

A fresh process restored the same preferences and hid the acknowledged first-launch offer. Native menu capture was reviewed; a caption/menu overlap found during review was fixed and the final menu capture shows unobstructed controls. Some earlier capture attempts returned UnknownVizError; final capture succeeded.

These checks do not certify WebGPU, city frame-rate performance, physical display/headphone behavior, complete WCAG conformance, or suitability for every impairment. Player accessibility review remains necessary.
