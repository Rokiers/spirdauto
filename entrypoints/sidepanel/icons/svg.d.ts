declare module "*.svg?react" {
  import type { FC, SVGProps } from "react";
  const C: FC<SVGProps<SVGSVGElement>>;
  export default C;
}
