import Dashboard from './pages/Dashboard';
import AddPlant from './pages/AddPlant';
import VoiceLog from './pages/VoiceLog';
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
import Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "AddPlant": AddPlant,
    "VoiceLog": VoiceLog,
    "PlantChat": PlantChat,
    "PlantDetail": PlantDetail,
    "Welcome": Welcome,
    "Schedule": Schedule,
    "Settings": Settings,
    "PrivacyPolicy": PrivacyPolicy,
    "Feed": Feed,
    "Profile": Profile,
    "MyProfile": MyProfile,
    "Messages": Messages,
    "ProfileSetup": ProfileSetup,
    "Search": Search,
    "FollowRequests": FollowRequests,
    "TermsAndConditions": TermsAndConditions,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: Layout,
};