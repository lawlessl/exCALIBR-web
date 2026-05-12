import logo0 from "../../assets/contributors/wisco.png";
import logo1 from "../../assets/contributors/wehi.png";
import logo2 from "../../assets/contributors/u_dub.png";
import logo3 from "../../assets/contributors/neu.png";
import logo4 from "../../assets/contributors/mount_sinai.png";
import logo5 from "../../assets/contributors/igvf.png";
import logo6 from "../../assets/contributors/broad.png";

import "../../styles/contributorCarousel.css";

const LOGOS = [logo0, logo1, logo2, logo3, logo4, logo5, logo6];

export default function ContributorCarousel() {
  // Duplicate the set so the scroll loop is seamless
  const items = [...LOGOS, ...LOGOS];

  return (
    <div className="cc-outer">
      <div className="cc-root">
        <div className="cc-track">
          {items.map((src, i) => (
            <div className="cc-slot" key={i}>
              <img
                src={src}
                alt={`Contributor ${(i % LOGOS.length) + 1}`}
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
