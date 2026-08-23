import React, { useState, useEffect, useCallback } from "react";

import Topbar from "./components/Topbar";
import Drawer from "./components/Drawer";
import FileViewerModal from "./components/FileViewerModal";
import SftpBrowserModal from "./components/SftpBrowserModal";

import { safeFetchJson } from "./utils/api";

import LoginPage from "./pages/LoginPage";
import TotpSetupPage from "./pages/TotpSetupPage";
import TotpVerifyPage from "./pages/TotpVerifyPage";
import FirstLoginPasswordPage from "./pages/FirstLoginPasswordPage";

import FlowView from "./pages/FlowView";
import ConversionsView from "./pages/ConversionsView";
import NoticesView from "./pages/NoticesView";
import ArchiveView from "./pages/ArchiveView";
import ConnectionsView from "./pages/ConnectionsView";
import ContactsView from "./pages/ContactsView";
import AdminView from "./pages/AdminView";


export default function App() {


  const [userState,setUserState] = useState(null);
  const [loadingUser,setLoadingUser] = useState(true);


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


      const {data}=await safeFetchJson(
        "/accounts/api/user/",
        {
          credentials:"include"
        }
      );


      console.log(
        "USER STATUS:",
        data
      );


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


  const refreshDashboardData = useCallback(async()=>{


    try{


      const [
        metricsResponse,
        filesResponse,
        sftpResponse

      ] = await Promise.all([


        safeFetchJson(
          "/edi835/api/metrics/",
          {
            credentials:"include"
          }
        ).catch(()=>null),



        safeFetchJson(
          "/edi835/api/tracked-files/",
          {
            credentials:"include"
          }
        ).catch(()=>null),



        safeFetchJson(
          "/edi835/api/sftp/get/",
          {
            credentials:"include"
          }
        ).catch(()=>null)



      ]);



      if(metricsResponse?.res.ok){

        setMetrics(
          metricsResponse.data
        );

      }



      if(filesResponse?.res.ok){

        setTrackedFiles(
          filesResponse.data.files || []
        );

      }




      if(sftpResponse?.res.ok){

        setSftpConfigs(
          sftpResponse.data.configurations || []
        );


        setActiveSftpConfig(
          sftpResponse.data.active_config || null
        );

      }



    }catch(error){


      console.warn(
        "Dashboard refresh failed",
        error
      );


    }


  },[]);





  useEffect(()=>{


    refreshDashboardData();


    const timer=setInterval(
      refreshDashboardData,
      3000
    );


    return ()=>clearInterval(timer);


  },[refreshDashboardData]);






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






  if(
    !userState ||
    !userState.authenticated
  ){


    return (

      <LoginPage

        isAdminRoute={isAdminRoute}

        onLoginSuccess={checkUserStatus}

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



    if(!user.totp_enabled){


      return (

        <TotpSetupPage

          onSetupSuccess={checkUserStatus}

          onLogout={handleLogout}

        />

      );


    }



    if(!user.totp_verified){


      return (

        <TotpVerifyPage

          onVerifySuccess={checkUserStatus}

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
