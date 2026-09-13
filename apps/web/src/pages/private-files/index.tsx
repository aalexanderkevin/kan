import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import PrivateFilesView from "~/views/private-files";

const PrivateFilesPage: NextPageWithLayout = () => (
  <>
    <PrivateFilesView />
    <Popup />
  </>
);
PrivateFilesPage.getLayout = getDashboardLayout;
export default PrivateFilesPage;
