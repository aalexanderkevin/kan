import { useRouter } from "next/router";

import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import PrivateDocumentView from "~/views/private-files/document";

const PrivateDocumentPage: NextPageWithLayout = () => {
  const { query } = useRouter();
  return (
    <>
      <PrivateDocumentView
        roomPublicId={
          typeof query.roomPublicId === "string" ? query.roomPublicId : ""
        }
        documentPublicId={
          typeof query.documentPublicId === "string"
            ? query.documentPublicId
            : ""
        }
      />
      <Popup />
    </>
  );
};
PrivateDocumentPage.getLayout = getDashboardLayout;
export default PrivateDocumentPage;
