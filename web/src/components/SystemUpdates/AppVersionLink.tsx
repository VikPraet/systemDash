import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../../brand";
import * as S from "../../App.styles";

/** Sidebar version badge — opens Updates. GitHub check runs on the Updates page only. */
export function AppVersionLink({ version }: { version: string }) {
  const navigate = useNavigate();

  return (
    <S.VersionButton
      type="button"
      onClick={() => navigate("/updates")}
      title={`${APP_NAME} version — open Updates`}
    >
      v{version}
    </S.VersionButton>
  );
}
