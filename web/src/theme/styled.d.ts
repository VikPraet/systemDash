import "styled-components";
import type { AppTheme } from "./theme";

// Make `props.theme` strongly typed everywhere styled-components is used.
declare module "styled-components" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends AppTheme {}
}
