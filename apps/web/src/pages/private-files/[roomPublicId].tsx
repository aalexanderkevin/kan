import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { PrivateRoomView } from "~/views/private-files";

const PrivateRoomPage: NextPageWithLayout = () => {
  const { query } = useRouter();
  return (
    <>
      <PrivateRoomView
        roomPublicId={
          typeof query.roomPublicId === "string" ? query.roomPublicId : ""
        }
      />
      <Popup />
    </>
  );
};
PrivateRoomPage.getLayout = getDashboardLayout;
export default PrivateRoomPage;
