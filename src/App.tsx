import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmProvider } from './components/ConfirmDialog';
import { AuthProvider } from './state/AuthContext';
import { AppProvider } from './state/AppContext';
import { AppLayout } from './app/AppLayout';
import { HomePage } from './pages/HomePage';
import { PracticePage } from './pages/PracticePage';
import { ChatPage, ExternalTeamChatPage } from './pages/ChatPage';
import { ChatTeamsPage } from './pages/ChatTeamsPage';
import { UploadPage } from './pages/UploadPage';
import { SchedulePage } from './pages/SchedulePage';
import { StoryUploadPage } from './pages/StoryUploadPage';
import { TeamFeedPage } from './pages/TeamFeedPage';
import { MySettingsPage } from './pages/MySettingsPage';
import { TeamProfileEditPage } from './pages/TeamProfileEditPage';
import { UserProfileEditPage } from './pages/UserProfileEditPage';
import { TeamProfilePage } from './features/feed/TeamProfile';

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ConfirmProvider>
          <BrowserRouter>
          <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="story/upload" element={<StoryUploadPage />} />
            <Route path="practice" element={<PracticePage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="chat/teams" element={<ChatTeamsPage />} />
            <Route path="chat/team/:teamId" element={<ExternalTeamChatPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="my" element={<TeamFeedPage />} />
            <Route path="my/team-profile" element={<TeamProfileEditPage />} />
            <Route path="my/user-profile" element={<UserProfileEditPage />} />
            <Route path="my/settings" element={<MySettingsPage />} />
            <Route path="team/:teamId" element={<TeamProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
        </ConfirmProvider>
      </AppProvider>
    </AuthProvider>
  );
}
