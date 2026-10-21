import Dashboard from './pages/Dashboard';
import AddPlant from './pages/AddPlant';
import PlantChat from './pages/PlantChat';
import PlantDetail from './pages/PlantDetail';
import Welcome from './pages/Welcome';
import Schedule from './pages/Schedule';
import Settings from './pages/Settings';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Feed from './pages/Feed';
import Profile from './pages/Profile';
import MyProfile from './pages/MyProfile';
import Messages from './pages/Messages';
import ProfileSetup from './pages/ProfileSetup';
import Search from './pages/Search';
import FollowRequests from './pages/FollowRequests';
import TermsAndConditions from './pages/TermsAndConditions';
import VacationReview from './pages/VacationReview';
import Premium from './pages/Premium';
import Plantdoku from './pages/Plantdoku';
import Games from './pages/Games';
import SproutWord from './pages/SproutWord';
import MiniGarden from './pages/MiniGarden';
import GardenGroups from './pages/GardenGroups';
import CommunityReports from './pages/CommunityReports';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "AddPlant": AddPlant,
    "PlantChat": PlantChat,
    "PlantDetail": PlantDetail,
    "Welcome": Welcome,
    "Schedule": Schedule,
    "Settings": Settings,
    "Premium": Premium,
    "PrivacyPolicy": PrivacyPolicy,
    "Feed": Feed,
    "Profile": Profile,
    "MyProfile": MyProfile,
    "Messages": Messages,
    "ProfileSetup": ProfileSetup,
    "Search": Search,
    "FollowRequests": FollowRequests,
    "TermsAndConditions": TermsAndConditions,
    "VacationReview": VacationReview,
    "Plantdoku": Plantdoku,
    "Games": Games,
    "SproutWord": SproutWord,
    "MiniGarden": MiniGarden,
    "GardenGroups": GardenGroups,
    "CommunityReports": CommunityReports,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};