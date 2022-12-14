package com.ssafy.rideus.dto.rideroom.request;

import com.ssafy.rideus.dto.rideroom.type.SocketMessageType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class GroupRiddingRequest {

    private SocketMessageType messageType;
    private Long rideRoomId;
    private String lat;
    private String lng;

}
