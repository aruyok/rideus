import React, { useCallback, useContext } from "react";
import { useEffect, useState } from "react";
import { Avatar, Box } from "grommet";
import { StyledText } from "../components/Common";
import Button from "../components/Button";
import { useGeolocated } from "react-geolocated";
import PlayBtn from "../assets/images/play.png";
import PauseBtn from "../assets/images/pause.png";
import LinkBtn from "../assets/images/link.png";
import TotalBike from "../assets/images/totalRideBike.png";
import GroupBike from "../assets/images/groupBike.png";
import Stop from "../assets/icons/stop.svg";
import {
  CustomOverlayMap,
  Map,
  MapMarker,
  Polyline,
} from "react-kakao-maps-sdk";
import { AlertDialog, MapDialog } from "../components/AlertDialog";
import {
  useLocation,
  useNavigate,
  UNSAFE_NavigationContext as NavigationContext,
} from "react-router-dom";
import history from "../utils/history.js";
import { latlng } from "../utils/data";
import useWatchLocation from "../hooks/watchLocationHook";
import {
  convertStringToColor,
  distanceHandle,
  httpToHttps,
  speedHandle,
  timeHandle,
} from "../utils/util";
import { ExitButton, PauseButton } from "../components/Buttons";
import SockJS from "sockjs-client";
import * as StompJs from "@stomp/stompjs";
import { finishRidding, saveCoordinatesDuringRide } from "../utils/api/rideApi";
import { TextField, ThemeProvider } from "@mui/material";
import { theme } from "./CourseList";
import useInterval from "../hooks/UseInterval";

// const geolocationOptions = {
//   enableHighAccuracy: false,
//   timeout: 500, // 1 min (1000 ms * 60 sec * 1 minute = 60 000ms)
//   maximumAge: 0, // 24 hour
// };
var client = null;
export const Ride = () => {
  const locations = useLocation();
  const [nowTime, setNowTime] = useState(0);
  const [mapData, setMapData] = useState({
    latlng: [],
    center: { lng: 127.002158, lat: 37.512847 },
  });
  const [idle, setIdle] = useState(1);
  const [data, setData] = useState({
    topSpeed: 0,
    avgSpeed: 0,
    totalDistance: 0,
  });
  // ?????? ??????, ?????? or ??????, ???????????? or ????????? ??????
  const {
    courseName,
    rideType,
    courseType,
    coordinates,
    checkPoints,
    recordId,
    courseId,
    roomInfo,
  } = locations.state;

  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [openMap, setOpenMap] = useState(false);
  const [riding, setRiding] = useState(true);
  const [when, setWhen] = useState(true);
  const [rideMembers, setRideMembers] = useState({ members: [] });
  const [lastLocation, setLastLocation] = useState(null);
  const [confirmedNavigation, setConfirmedNavigation] = useState(false);
  const { coords, isGeolocationAvailable, isGeolocationEnabled } =
    useGeolocated({
      positionOptions: {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 500,
      },
      watchPosition: true,
    });

  // ?????? ??????
  const preventClose = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };

  // ????????? ??????
  const subscribe = () => {
    if (client != null) {
      console.log("subs!!!!!!!!!");
      client.subscribe("/sub/ride/room/" + roomInfo.rideRoomId, (response) => {
        console.log(response);
        const data = JSON.parse(response.body);
        rideMembers.members[data.memberId] = data;
        setRideMembers({ ...rideMembers });
      });
    }
  };

  //????????? ?????? ??????
  const publishLocation = (lat, lng) => {
    if (client != null) {
      client.publish({
        destination: "/pub/ride/group",
        headers: {
          Authorization: "Bearer " + localStorage.getItem("accessToken"),
        },
        body: JSON.stringify({
          messageType: "CURRENT_POSITION",
          rideRoomId: roomInfo.rideRoomId,
          lat: lat,
          lng: lng,
        }),
      });
    }
  };

  //????????? ?????????
  const initSocketClient = () => {
    client = new StompJs.Client({
      brokerURL: "wss://j7a603.p.ssafy.io/api/ws-stomp",
      connectHeaders: {
        Authorization: "Bearer " + localStorage.getItem("accessToken"),
      },
      webSocketFactory: () => {
        return SockJS("https://j7a603.p.ssafy.io/api/ws-stomp");
      },
      debug: (str) => {
        console.log("stomp debug!!!", str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,

      onStompError: (frame) => {
        // Will be invoked in case of error encountered at Broker
        // Bad login/passcode typically will cause an error
        // Complaint brokers will set `message` header with a brief message. Body may contain details.
        // Compliant brokers will terminate the connection after any error
        console.log("Broker reported error: " + frame.headers["message"]);
        console.log("Additional details: " + frame.body);
        // client.deactivate();
      },
    });

    // ????????? ?????? ??????
    client.onConnect = (frame) => {
      console.log("client init !!! ", frame);
      if (client != null)
        client.publish({
          destination: "/pub/ride/group",
          headers: {
            Authorization: "Bearer " + localStorage.getItem("accessToken"),
          },
          body: JSON.stringify({
            messageType: "ENTER",
            rideRoomId: roomInfo.rideRoomId,
          }),
        });
      subscribe();
    };

    client.activate();
  };

  // ????????? ????????????
  const disConnect = () => {
    if (client != null) {
      if (client.connected) client.deactivate();
    }
  };

  // ??? ????????? ?????? ??????
  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1); // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    d = Math.round(d * 1000);
    return d;
  }

  // ????????? ??????????????? ??????
  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // function getDistance(lat1, lon1, lat2, lon2) {
  //   if (lat1 == lat2 && lon1 == lon2) return 0;

  //   var radLat1 = (Math.PI * lat1) / 180;
  //   var radLat2 = (Math.PI * lat2) / 180;
  //   var theta = lon1 - lon2;
  //   var radTheta = (Math.PI * theta) / 180;
  //   var dist =
  //     Math.sin(radLat1) * Math.sin(radLat2) +
  //     Math.cos(radLat1) * Math.cos(radLat2) * Math.cos(radTheta);
  //   if (dist > 1) dist = 1;

  //   dist = Math.acos(dist);
  //   dist = (dist * 180) / Math.PI;
  //   dist = dist * 60 * 1.1515 * 1.609344 * 1000;
  //   // dist = dist * 6371;
  //   if (dist < 100) dist = Math.round(dist / 10) * 10;
  //   else dist = Math.round(dist / 100) * 100;

  //   return dist;
  // }

  // ???????????? ??????
  function useBlocker(blocker, when = true) {
    const { navigator } = useContext(NavigationContext);

    useEffect(() => {
      if (!when) {
        return;
      }
      const unblock = navigator.block((tx) => {
        const autoUnblockingTx = {
          ...tx,
          retry() {
            // Automatically unblock the transition so it can play all the way
            // through before retrying it. T O D O: Figure out how to re-enable
            // this block if the transition is cancelled for some reason.
            unblock();
            tx.retry();
          },
        };

        blocker(autoUnblockingTx);
      });

      // eslint-disable-next-line consistent-return
      return unblock;
    }, [navigator, blocker]);
  }

  // ?????? ??????
  const handleBlockedNavigation = useCallback(
    (tx) => {
      if (!confirmedNavigation && tx.location.pathname !== locations.pathname) {
        confirmNavigation();
        setOpen(true);
        setLastLocation(tx);
        return false;
      }
      return true;
    },
    [confirmedNavigation, locations.pathname]
  );

  // ?????? ??????
  const confirmNavigation = useCallback(() => {
    setOpen(false);
    setWhen(false);
    setConfirmedNavigation(true);
  }, []);

  // ?????? ?????? ??????
  const handleRideFinish = () => {
    saveCoordinatesDuringRide(
      {
        coordinates: mapData.latlng,
        rideRoomId: roomInfo === undefined ? null : roomInfo.rideRoomId,
      },
      (response1) => {
        console.log(response1);
        finishRidding(
          rideType,
          {
            courseId: courseId === undefined ? null : courseId,
            distance: data.totalDistance,
            recordId: response1.data.recordId,
            rideRoomId: roomInfo === undefined ? null : roomInfo.rideRoomId,
            speedAvg: data.avgSpeed,
            speedBest: data.topSpeed,
            time: nowTime,
            timeMinute: parseInt(nowTime / 60),
          },
          (response) => {
            console.log(response);
            // // ????????? ?????? ??????
            // if (courseType === "my") {

            // }
            // // ?????? ?????? ??????
            // else if (courseType === "course") {

            // }
          },
          (fail) => {
            console.log(fail);
          }
        ).then(
          navigate("/rideEnd", {
            state: {
              courseType: courseType,
              courseData: {
                recordId: response1.data.recordId,
                courseId: courseId,
                courseName: courseName,
                latlng: mapData.latlng,
                topSpeed: data.topSpeed,
                avgSpeed: data.avgSpeed,
                nowTime: nowTime,
                totalDistance: data.totalDistance,
              },
            },
          })
        );
      },
      (fail) => {
        console.log(fail);
      }
    );
  };

  // ????????? ?????? ?????? ??????
  const unconfirmNavigation = useCallback(() => {
    setOpen(false);
    setWhen(true);
    setConfirmedNavigation(false);
  }, []);

  // ?????? ?????? ????????????
  const sharePage = () => {
    window.navigator.share({
      title: `RideUs - ${roomInfo.nickname}?????? ?????? ??????`,
      text: `${courseName}`,
      url: `https://j7a603.p.ssafy.io/groupRide?courseId=${courseId}&rideRoomId=${roomInfo.rideRoomId}&nickname=${roomInfo.nickname}`,
    });
  };

  // ?????? ?????? useEffect
  // useEffect(() => {
  //   // const timerId = setTimeout(() => {
  //   //   setNowTime((prev) => prev + 1);
  //   // }, 1000);
  //   // return () => {
  //   //   clearTimeout(timerId);
  //   //   // cancelLocationWatch();
  //   //   // window.removeEventListener("beforeunload", preventClose);
  //   // };
  // });

  useInterval(() => {
    setNowTime(nowTime + 1);
  }, 1000);

  useEffect(() => {
    if (rideType === "group") {
      initSocketClient();
    }

    return () => {
      if (rideType === "group") {
        disConnect();
      }
    };
  }, []);

  useInterval(() => {
    if (riding && isGeolocationAvailable && isGeolocationEnabled) {
      console.log("location : ", coords);

      const gps = {
        lat: coords.latitude,
        lng: coords.longitude,
      };

      console.log("gps : ", gps);
      // ???????????? ????????? ?????? ???
      if (
        mapData.latlng.length > 0 &&
        mapData.latlng.at(-1).lat === gps.lat &&
        mapData.latlng.at(-1).lng === gps.lng
      ) {
      } else {
        setMapData((prev) => {
          return {
            center: gps,
            latlng: [...prev.latlng, gps],
          };
        });
        // ????????? 1??? ????????? ??????????????? ??? ?????? ??????
        if (mapData.latlng.length > 1) {
          console.log("data : ", data);

          let dis = getDistanceFromLatLonInKm(
            mapData.latlng.at(-1).lat,
            mapData.latlng.at(-1).lng,
            gps.lat,
            gps.lng
          );
          console.log("dis: ", dis);
          if (dis > 0) {
            setData((prev) => ({
              topSpeed: Math.max(
                prev.topSpeed,
                speedHandle(dis, 1) < 40 ? speedHandle(dis, 1) : prev.topSpeed
              ),
              avgSpeed:
                (prev.avgSpeed +
                  (speedHandle(dis, 1) > 0
                    ? speedHandle(dis, 1)
                    : prev.avgSpeed)) /
                2,
              totalDistance: prev.totalDistance + dis,
            }));
          }
          // idle = 1;
        }
      }

      // setI((prev) => {
      //   return prev + 0.001;
      // });
      // ????????? ??????
      if (client != null && rideType === "group") {
        publishLocation(gps.lat, gps.lng);
      }
    } else {
      // idle = idle + 1;
      setData((prev) => {
        return {
          topSpeed: prev.topSpeed,
          avgSpeed: prev.avgSpeed,
          totalDistance: prev.totalDistance,
        };
      });
    }
  }, 1000);

  // ??????, ????????? ?????? useEffect
  useEffect(() => {
    // console.log("hello");
    // let i = 0.000001;
    window.addEventListener("beforeunload", preventClose);
    // let i = 0;
    // setNowTime(0);

    // const rideId = setInterval(() => {
    //   if (riding && isGeolocationAvailable && isGeolocationEnabled) {
    //     console.log("location : ", coords);

    //     const gps = {
    //       lat: coords.latitude,
    //       lng: coords.longitude,
    //     };

    //     console.log("gps : ", gps);
    //     // ???????????? ????????? ?????? ???
    //     if (
    //       mapData.latlng.length > 0 &&
    //       mapData.latlng.at(-1).lat === gps.lat &&
    //       mapData.latlng.at(-1).lng === gps.lng
    //     ) {
    //       idle = idle + 1;
    //     } else {
    //       setMapData((prev) => {
    //         return {
    //           center: gps,
    //           latlng: [...prev.latlng, gps],
    //         };
    //       });
    //       // ????????? 1??? ????????? ??????????????? ??? ?????? ??????
    //       if (mapData.latlng.length > 1) {
    //         console.log("data : ", data);

    //         let dis = getDistanceFromLatLonInKm(
    //           mapData.latlng.at(-1).lat,
    //           mapData.latlng.at(-1).lng,
    //           gps.lat,
    //           gps.lng
    //         );
    //         console.log("dis: ", dis);
    //         if (dis > 0) {
    //           setData((prev) => ({
    //             topSpeed: Math.max(prev.topSpeed, speedHandle(dis, idle)),
    //             avgSpeed: (prev.avgSpeed + speedHandle(dis, idle)) / 2,
    //             totalDistance: prev.totalDistance + dis,
    //           }));
    //           idle = 1;
    //         }
    //         // idle = 1;
    //       }
    //     }

    //     // setI((prev) => {
    //     //   return prev + 0.001;
    //     // });
    //     // ????????? ??????
    //     if (client != null && rideType === "group") {
    //       publishLocation(gps.lat, gps.lng);
    //     }
    //   } else {
    //     // idle = idle + 1;
    //     setData((prev) => {
    //       return {
    //         topSpeed: prev.topSpeed,
    //         avgSpeed: prev.avgSpeed,
    //         totalDistance: prev.totalDistance,
    //       };
    //     });
    //   }
    //   // setI((prev) => {
    //   //   return prev + 0.0001;
    //   // });
    //   // console.log(mapData.latlng);
    // }, 1000);

    return () => {
      // clearInterval(rideId);
      // cancelLocationWatch();

      window.removeEventListener("beforeunload", preventClose);
    };
  });
  useBlocker(handleBlockedNavigation, when);

  return (
    <Box background="#64CCBE">
      {/* ????????? ??? */}
      <Box
        align="center"
        margin={{ top: "30px", bottom: "12px" }}
        direction="row"
        justify="around"
      >
        <Box width="50px"></Box>
        <Box>
          <StyledText
            text={courseName}
            color="white"
            weight="bold"
            size="24px"
            style={{
              fontFamily: "gwtt",
            }}
          />
        </Box>
        <Box width="50px">
          {rideType === "group" && (
            <img
              src={LinkBtn}
              width="29px"
              height="29px"
              onClick={() => {
                sharePage();
              }}
            />
          )}
        </Box>
      </Box>
      {rideType === "group" && (
        <Box align="center" margin={{ bottom: "12px" }}>
          <StyledText
            text={roomInfo.nickname + "?????? ??????"}
            color="white"
            weight="bold"
            size="16px"
          />
        </Box>
      )}

      {/* ?????? ?????? */}
      <Box
        align="center"
        height="90vh"
        round={{ size: "large", corner: "top" }}
        background="#ffffff"
        pad={{ top: "20px", bottom: "20px" }}
        border={{ color: "#ffffff", size: "small", side: "top" }}
        gap="medium"
      >
        {/* ???????????? */}
        <Box
          style={{ width: "85%", height: "40vh" }}
          onClick={() => {
            confirmNavigation();
            setOpenMap(true);
          }}
        >
          <Map
            center={mapData.center}
            isPanto={true}
            style={{ borderRadius: "25px", width: "100%", height: "100%" }}
          >
            {mapData.latlng && (
              <Polyline
                path={[mapData.latlng]}
                strokeWeight={5} // ?????? ?????? ?????????
                strokeColor={"#030ff1"} // ?????? ???????????????
                strokeOpacity={0.7} // ?????? ???????????? ????????? 1?????? 0 ????????? ????????? 0??? ??????????????? ???????????????
                strokeStyle={"solid"} // ?????? ??????????????????
              />
            )}
            {coordinates && (
              <Polyline
                path={[coordinates]}
                strokeWeight={5} // ?????? ?????? ?????????
                strokeColor={"#5b60b8"} // ?????? ???????????????
                strokeOpacity={0.7} // ?????? ???????????? ????????? 1?????? 0 ????????? ????????? 0??? ??????????????? ???????????????
                strokeStyle={"solid"} // ?????? ??????????????????
              />
            )}
            <MapMarker
              position={
                coordinates
                  ? coordinates[0]
                  : { lng: 127.002158, lat: 37.512847 }
              }
              image={{
                src: `/images/start.png`,
                size: {
                  width: 29,
                  height: 41,
                }, // ?????????????????? ???????????????
              }}
            ></MapMarker>
            {coordinates &&
            coordinates[0].lat === coordinates[coordinates.length - 1].lat &&
            coordinates[0].lng === coordinates[coordinates.length - 1].lng ? (
              <MapMarker
                position={coordinates[0]}
                image={{
                  src: `/images/start.png`,
                  size: {
                    width: 29,
                    height: 41,
                  }, // ?????????????????? ???????????????
                }}
              ></MapMarker>
            ) : (
              <MapMarker
                position={
                  coordinates ? coordinates[coordinates.length - 1] : []
                }
                image={{
                  src: `/images/end.png`,
                  size: {
                    width: 29,
                    height: 41,
                  }, // ?????????????????? ???????????????
                }}
              ></MapMarker>
            )}
            {rideMembers &&
              rideMembers.members.map((member, idx) => {
                console.log(member);
                return (
                  // <MapMarker
                  //     position={{lat: member.lat, lng: member.lng}}
                  //     key={idx}
                  //     image={{
                  //         src: "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png",
                  //         size: {width: 45, height: 45},
                  //         options:{shape:"circle"}
                  //     }}
                  // >
                  //     {" "}
                  //     <div style={{color: "#000"}}>{member.nickname}</div>
                  // </MapMarker>
                  <CustomOverlayMap // ????????? ??????????????? ????????? Container
                    // ????????? ??????????????? ????????? ???????????????
                    position={{ lat: member.lat, lng: member.lng }}
                    key={idx}
                  >
                    {/* ????????? ??????????????? ????????? ??????????????? */}
                    <Avatar
                      src={httpToHttps(member.profileImageUrl)}
                      style={{
                        width: "35px",
                        height: "35px",
                        border: `3px inset ${convertStringToColor(
                          member.color
                        )}`,
                      }}
                    />
                  </CustomOverlayMap>
                );
              })}
          </Map>
        </Box>
        {/* ????????? ?????? ?????? */}
        <Box direction="row" justify="between" width="85%">
          {/* ??? ???????????? ?????? */}
          <Box direction="row" align="center">
            {/* ????????? ????????? */}
            <img src={rideType === "single" ? TotalBike : GroupBike} alt="" />
            {/* ??? ???????????? ????????? */}
            <Box
              align="center"
              style={{ marginLeft: "10px", marginRight: "5px" }}
            >
              <StyledText
                text={distanceHandle(data.totalDistance)}
                size="40px"
                weight="bold"
              />
              <StyledText text="??? ????????????" color="#979797" size="10px" />
            </Box>
            <StyledText
              text={data.totalDistance > 1000 ? "km" : "m"}
              color="#979797"
            />
          </Box>
          {/* ??? ???????????? ??? */}
          {/* ?????? ????????? ?????? */}
          <Box direction="row" align="center" gap="medium">
            {/* ???????????? */}
            <Box align="center">
              <StyledText
                text={timeHandle(nowTime)}
                weight="bold"
                size="18px"
              />
              <StyledText text="?????? ??????" size="10px" />
            </Box>
            {/* ?????? ?????? */}
            <Box align="center">
              <StyledText
                text={parseFloat(data.avgSpeed).toFixed(1)}
                weight="bold"
                size="18px"
              />
              <StyledText text="?????? ??????" size="10px" />
            </Box>
            {/* ?????? ?????? */}
            <Box align="center">
              <StyledText
                text={parseFloat(data.topSpeed).toFixed(1)}
                weight="bold"
                size="18px"
              />
              <StyledText text="?????? ??????" size="10px" />
            </Box>
          </Box>
          {/* ??????????????? ??? */}
        </Box>
        {/* ????????? ?????? ??? */}
        {/* ?????? ?????? ????????? */}
        {rideType === "group" && (
          <Box
            width="90%"
            pad="medium"
            margin={{ top: "20px", bottom: "10px" }}
            style={{
              borderRadius: "10px",
              border: "2px solid #64CCBE",
              fontWeight: "bold",
              position: "relative",
              flexDirection: "row",
              justifyContent: "space-evenly",
            }}
          >
            <StyledText
              text={roomInfo.nickname + "?????? ??????"}
              weight="bold"
              style={{
                background: "white",
                position: "absolute",
                zIndex: 500,
                top: -14,
                padding: "0 5px",
              }}
            />
            {rideMembers.members.map((m, idx) => {
              return (
                <StyledText
                  key={idx}
                  text={m.nickname}
                  color={convertStringToColor(m.color)}
                />
              );
            })}
          </Box>
        )}
        {/* ????????????, ??????????????? ?????? */}
        <Box width="90%">
          <Box direction="row" justify="center">
            {/* ???????????? ?????? */}
            <PauseButton
              onClick={() => {
                if (riding === true) setRiding(false);
                else setRiding(true);
              }}
              whileTap={{ scale: 1.2 }}
            >
              <Box
                direction="row"
                align="center"
                justify="center"
                style={{
                  color: "white",
                }}
                gap="small"
              >
                <img
                  src={riding ? PauseBtn : PlayBtn}
                  width="25px"
                  height="25px"
                />
                {riding ? "????????????" : "????????????"}
              </Box>
            </PauseButton>
            {/* ?????? ????????? ?????? ?????? */}
            <ExitButton
              onClick={() => {
                confirmNavigation();
                setOpen(true);
              }}
              whileTap={{ scale: 1.2 }}
            >
              <Box
                direction="row"
                align="center"
                justify="center"
                style={{
                  color: "white",
                }}
                gap="small"
              >
                <img src={Stop} width="25px" height="25px" />
                {"?????? ??????"}
              </Box>
            </ExitButton>
          </Box>
          {/* ?????? ?????? ?????? */}
          <Box direction="row"></Box>
        </Box>
      </Box>
      <MapDialog
        type="riding"
        open={openMap}
        handleClose={() => {
          unconfirmNavigation();
          setOpenMap(false);
        }}
        handleAction={() => {
          setOpen(true);
        }}
        map={
          <Map
            center={mapData.center}
            isPanto={true}
            style={{ width: "100%", height: "100%" }}
          >
            {mapData.latlng && (
              <Polyline
                path={[mapData.latlng]}
                strokeWeight={5} // ?????? ?????? ?????????
                strokeColor={"#030ff1"} // ?????? ???????????????
                strokeOpacity={0.7} // ?????? ???????????? ????????? 1?????? 0 ????????? ????????? 0??? ??????????????? ???????????????
                strokeStyle={"solid"} // ?????? ??????????????????
              />
            )}
            {coordinates && (
              <Polyline
                path={[coordinates]}
                strokeWeight={5} // ?????? ?????? ?????????
                strokeColor={"#5b60b8"} // ?????? ???????????????
                strokeOpacity={0.7} // ?????? ???????????? ????????? 1?????? 0 ????????? ????????? 0??? ??????????????? ???????????????
                strokeStyle={"solid"} // ?????? ??????????????????
              />
            )}
            <MapMarker
              position={
                coordinates
                  ? coordinates[0]
                  : { lng: 127.002158, lat: 37.512847 }
              }
              image={{
                src: `/images/start.png`,
                size: {
                  width: 29,
                  height: 41,
                }, // ?????????????????? ???????????????
              }}
            ></MapMarker>
            {coordinates &&
            coordinates[0].lat === coordinates[coordinates.length - 1].lat &&
            coordinates[0].lng === coordinates[coordinates.length - 1].lng ? (
              <MapMarker
                position={coordinates[0]}
                image={{
                  src: `/images/start.png`,
                  size: {
                    width: 29,
                    height: 41,
                  }, // ?????????????????? ???????????????
                }}
              ></MapMarker>
            ) : (
              <MapMarker
                position={
                  coordinates ? coordinates[coordinates.length - 1] : []
                }
                image={{
                  src: `/images/end.png`,
                  size: {
                    width: 29,
                    height: 41,
                  }, // ?????????????????? ???????????????
                }}
              ></MapMarker>
            )}
            {rideMembers &&
              rideMembers.members.map((member, idx) => {
                console.log(member);
                return (
                  // <MapMarker
                  //     position={{lat: member.lat, lng: member.lng}}
                  //     key={idx}
                  //     image={{
                  //         src: "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png",
                  //         size: {width: 45, height: 45},
                  //         options:{shape:"circle"}
                  //     }}
                  // >
                  //     {" "}
                  //     <div style={{color: "#000"}}>{member.nickname}</div>
                  // </MapMarker>
                  <CustomOverlayMap // ????????? ??????????????? ????????? Container
                    // ????????? ??????????????? ????????? ???????????????
                    position={{ lat: member.lat, lng: member.lng }}
                    key={idx}
                  >
                    {/* ????????? ??????????????? ????????? ??????????????? */}
                    <Avatar
                      src={httpToHttps(member.profileImageUrl)}
                      style={{
                        width: "35px",
                        height: "35px",
                        border: `3px inset ${convertStringToColor(
                          member.color
                        )}`,
                      }}
                    />
                  </CustomOverlayMap>
                );
              })}
          </Map>
        }
        cancel="????????????"
        accept="????????????"
        title={courseName}
      />
      <AlertDialog
        open={open}
        handleClose={() => {
          unconfirmNavigation();
          setOpen(false);
        }}
        handleAction={() => {
          // useBlocker(handleBlockedNavigation, false);
          handleRideFinish();
        }}
        title="?????? ??????"
        desc="????????? ?????????????????????????"
        cancel="??????"
        accept="??????"
      />
    </Box>
  );
};
