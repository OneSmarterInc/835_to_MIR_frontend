import React, { useState, useEffect, useCallback } from "react";

import Topbar from "./components/Topbar";
import Drawer from "./components/Drawer";
import FileViewerModal from "./components/FileViewerModal";
import SftpBrowserModal from "./components/SftpBrowserModal";
import AccessDeniedScreen from "./components/AccessDeniedScreen";

import { safeFetchJson } from "./utils/api";
import { clearSessionExpiry, scheduleSessionExpiry } from "./utils/sessionExpiry";

import LoginPage from "./pages/LoginPage";
import TotpSetupPage from "./pages/TotpSetupPage";
import TotpVerifyPage from "./pages/TotpVerifyPage";
import FirstLoginPasswordPage from "./pages/FirstLoginPasswordPage";

import FlowView from "./pages/FlowView";
import ConversionsView from "./pages/ConversionsView";
import ChecksView from "./pages/ChecksView";
import CodeDictionaryView from "./pages/CodeDictionaryView";
import NoticesView from "./pages/NoticesView";
import ArchiveView from "./pages/ArchiveView";
import ConnectionsView from "./pages/ConnectionsView";
import ContactsView from "./pages/ContactsView";
import AdminView from "./pages/AdminView";
import ResultView from "./pages/ResultView";
import ClientClaimSearchView from "./pages/ClientClaimSearchView";
import SecurityView from "./pages/SecurityView";


export default function App() {


  const [userState,setUserState] = useState(null);
  const [loadingUser,setLoadingUser] = useState(true);
  const [authNext,setAuthNext] = useState(null);




  const [isAdminRoute,setIsAdminRoute] = useState(()=>{

    const path = window.location.pathname.toLowerCase();

    return (
      path.includes("administrator") ||
      path.includes("adminstrator") ||
      path.startsWith("/mapping")
    );

  });



  const [activeTab,setActiveTab] = useState(()=>{

    try{

      const saved = localStorage.getItem("activeTab");

      return saved || "flow";

    }catch{

      return "flow";

    }

  });



  const [isDrawerOpen,setIsDrawerOpen] = useState(false);


  useEffect(()=>{


    const checkRoute = ()=>{

      const path = window.location.pathname.toLowerCase();

      setIsAdminRoute(
        path.includes("administrator") ||
        path.includes("adminstrator") ||
        path.startsWith("/mapping")
      );

    };


    window.addEventListener(
      "popstate",
      checkRoute
    );


    return ()=>{

      window.removeEventListener(
        "popstate",
        checkRoute
      );

    };


  },[]);





  const handleTabChange=(tab)=>{


    if(tab==="admin")
      return;


    setActiveTab(tab);


    try{

      localStorage.setItem(
        "activeTab",
        tab
      );

    }catch(e){}


    setIsDrawerOpen(false);

  };





  const [viewerFileId,setViewerFileId]=useState(null);

  const [sftpBrowserState,setSftpBrowserState]=useState(null);



  const [metrics,setMetrics]=useState({});

  const [trackedFiles,setTrackedFiles]=useState([]);

  const [sftpConfigs,setSftpConfigs]=useState([]);

  const [activeSftpConfig,setActiveSftpConfig]=useState(null);





  // ===========================
  // CHECK LOGIN SESSION
  // ===========================


  const checkUserStatus = useCallback(async()=>{


    try{

      // Never let the initial auth check hold the entire application on a
      // blank loading screen when the backend/session endpoint is slow or
      // unreachable. Fall back to the login screen after 8 seconds.
      const userRequest = safeFetchJson(
        "/accounts/api/user/",
        {
          credentials:"include"
        }
      );
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Authentication check timed out.")), 8000)
      );
      const {data}=await Promise.race([userRequest, timeout]);

      setUserState(data);



    }catch(error){


      console.error(
        "USER CHECK ERROR",
        error
      );


      setUserState({

        authenticated:false,

        user:null

      });



    }finally{


      setLoadingUser(false);


    }


  },[]);





  useEffect(()=>{

    checkUserStatus();

  },[checkUserStatus]);





  // ===========================
  // DASHBOARD DATA
  // ===========================


  const refreshOperationalData = useCallback(async()=>{
    try{
      const [metricsResponse, sftpResponse] = await Promise.all([
        safeFetchJson(
          "/edi835/api/metrics/",
          { credentials:"include" }
        ).catch(()=>null),
        safeFetchJson(
          "/edi835/api/sftp/get/",
          { credentials:"include" }
        ).catch(()=>null)
      ]);

      if(metricsResponse?.res.ok){
        setMetrics(metricsResponse.data);
      }

      if(sftpResponse?.res.ok){
        setSftpConfigs(sftpResponse.data.configurations || []);
        setActiveSftpConfig(sftpResponse.data.active_config || null);
      }
    }catch(error){
      console.warn("Operational dashboard refresh failed", error);
    }
  },[]);


  const loadTrackedFiles = useCallback(async()=>{
    try{
      const {res, data} = await safeFetchJson(
        "/edi835/api/tracked-files/?include_conversion_findings=0",
        { credentials:"include" }
      );

      if(res.ok){
        setTrackedFiles(data.files || []);
      }
    }catch(error){
      console.warn("Tracked files refresh failed", error);
    }
  },[]);


  const refreshDashboardData = useCallback(async()=>{
    await Promise.all([
      refreshOperationalData(),
      loadTrackedFiles()
    ]);
  },[refreshOperationalData, loadTrackedFiles]);


  useEffect(()=>{
    // Do not compete with the session bootstrap request. On a small Gunicorn
    // deployment these three dashboard calls could queue ahead of /api/user/
    // and leave the entire application on the loading screen.
    if(!userState?.authenticated || isAdminRoute){
      return undefined;
    }

    const initialRefresh=setTimeout(refreshDashboardData,0);

    // Lightweight metrics/SFTP state can age a little while the user is idle.
    // Heavy tracked-file history is not polled; it refreshes on focus or after
    // an action that explicitly calls refreshDashboardData.
    const timer=setInterval(()=>{
      if(document.visibilityState === "visible"){
        refreshOperationalData();
      }
    },30000);

    const refreshWhenActive=()=>{
      if(document.visibilityState === "visible"){
        refreshDashboardData();
      }
    };

    window.addEventListener("focus",refreshWhenActive);
    document.addEventListener("visibilitychange",refreshWhenActive);

    return ()=>{
      clearTimeout(initialRefresh);
      clearInterval(timer);
      window.removeEventListener("focus",refreshWhenActive);
      document.removeEventListener("visibilitychange",refreshWhenActive);
    };
  },[
    userState?.authenticated,
    isAdminRoute,
    refreshDashboardData,
    refreshOperationalData
  ]);





  // ===========================
  // LOGOUT
  // ===========================


  const handleLogout=async()=>{


    try{


      await fetch(
        "/accounts/api/logout/",
        {

          method:"POST",

          credentials:"include"

        }
      );


    }catch(error){


      console.warn(
        error
      );


    }


    setUserState({

      authenticated:false,

      user:null

    });

    setAuthNext(null);
    clearSessionExpiry();


  };

  useEffect(() => {
    if (!userState?.authenticated) return undefined;
    return scheduleSessionExpiry(handleLogout);
  }, [userState?.authenticated]);


  // Preserve the backend's authentication decision. This prevents a stale
  // user-info response from sending a new user directly to TOTP verification.
  const handleLoginSuccess = async(loginData)=>{

    setAuthNext(loginData?.next || null);

    await checkUserStatus();

  };

  const handleAccessDenied = (loginData)=>{
    setAuthNext(null);
    setUserState({
      authenticated:false,
      offboarded:true,
      offboarded_message:loginData?.message || loginData?.error,
      client:loginData?.client || null,
      user:null
    });
  };







  if(loadingUser){


    return (

      <div
        style={{
          height:"100vh",
          display:"flex",
          justifyContent:"center",
          alignItems:"center"
        }}
      >

        Loading MIR Relay...

      </div>

    );

  }

  // This gate is deliberately above every portal/admin route and MFA flow.
  // Server-side middleware independently enforces the same restriction.
  if(userState?.offboarded){
    return (
      <AccessDeniedScreen
        client={userState.client || userState.user?.client}
        message={userState.offboarded_message}
        onExit={handleLogout}
      />
    );
  }






  if(
    !userState ||
    !userState.authenticated
  ){


    return (

      <LoginPage

        isAdminRoute={isAdminRoute}

        onLoginSuccess={handleLoginSuccess}

        onAccessDenied={handleAccessDenied}

      />

    );

  }






  const user=userState.user;






  // ADMIN REDIRECT


  if(

    user?.is_staff &&
    !isAdminRoute

  ){


    window.location.replace(
      "/administrator"
    );


    return null;


  }






  if(userState.authenticated){



    const needsTotpSetup =
      authNext === "totp_setup" ||
      user.totp_enabled !== true;


    if(needsTotpSetup){


      return (

        <TotpSetupPage

          onSetupSuccess={async()=>{
            await checkUserStatus();
            setAuthNext(null);
          }}

          onLogout={handleLogout}

        />

      );

    }



    if(
      authNext === "totp_verify" ||
      !user.totp_verified
    ){


      return (

        <TotpVerifyPage

          onVerifySuccess={async()=>{
            await checkUserStatus();
            setAuthNext(null);
          }}

          onSetupRequired={()=>
            setAuthNext("totp_setup")
          }

          onLogout={handleLogout}

        />

      );

    }



    if(user.first_login){


      return (

        <FirstLoginPasswordPage

          onPasswordChangeSuccess={
            checkUserStatus
          }

          onLogout={handleLogout}

        />

      );

    }


  }







  // ADMIN PAGE


  if(isAdminRoute){



    if(!user.is_staff){


      return (

        <div>

          Access Denied

        </div>

      );


    }


    return (

      <AdminView

        user={user}

        onLogout={handleLogout}

      />


    );


  }








  return (

    <div>


      <Topbar

        user={user}

        onToggleDrawer={()=>
          setIsDrawerOpen(!isDrawerOpen)
        }

        onLogout={handleLogout}

      />




      <div className="shell">


        <Drawer

          isOpen={isDrawerOpen}

          activeTab={activeTab}

          onSelectTab={handleTabChange}

          onClose={()=>
            setIsDrawerOpen(false)
          }

        />




        <main className="main">


          {
            activeTab==="flow" &&

            <FlowView

              metrics={metrics}

              recentFiles={trackedFiles}

              inboundConfig={activeSftpConfig}

              outboundConfig={activeSftpConfig}

            />

          }



          {
            activeTab==="batches" &&

            <ConversionsView

              trackedFiles={trackedFiles}

              onRefreshData={
                refreshDashboardData
              }

              onOpenFileModal={
                setViewerFileId
              }

            />

          }



          {
            activeTab==="checks" &&
            <ChecksView
              trackedFiles={trackedFiles}
            />
          }

          {
            activeTab==="search" &&
            <ClientClaimSearchView />
          }

          {
            activeTab==="code-dictionary" &&
            <CodeDictionaryView/>
          }

          {
            activeTab==="notices" &&
            <NoticesView/>
          }




          {
            activeTab==="archive" &&

            <ArchiveView

              metrics={metrics}

              trackedFiles={trackedFiles}

              sftpConfig={activeSftpConfig}

              onRefreshData={
                refreshDashboardData
              }

              onOpenFileModal={
                setViewerFileId
              }

            />

          }

          {
            activeTab==="result" &&
            <ResultView />
          }



          {
            activeTab==="conn" &&

            <ConnectionsView

              sftpConfigs={sftpConfigs}

              activeConfig={activeSftpConfig}

              onRefreshSftp={
                refreshDashboardData
              }

              onOpenSftpBrowser={
                setSftpBrowserState
              }

            />

          }




          {
            activeTab==="contacts" &&
            <ContactsView/>
          }

          {
            activeTab==="security" &&
            <SecurityView/>
          }


        </main>


      </div>






      <FileViewerModal

        fileId={viewerFileId}

        onClose={()=>
          setViewerFileId(null)
        }

      />




      {
        sftpBrowserState &&

        <SftpBrowserModal

          isOpen={true}

          initialPath={
            sftpBrowserState.initialPath
          }

          configId={
            activeSftpConfig?.id
          }

          {...sftpBrowserState}

          onClose={()=>
            setSftpBrowserState(null)
          }

        />

      }



    </div>

  );

}
