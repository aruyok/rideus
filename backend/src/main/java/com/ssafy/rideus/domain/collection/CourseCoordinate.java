package com.ssafy.rideus.domain.collection;

import lombok.*;

import org.springframework.data.mongodb.core.mapping.Document;

import com.ssafy.rideus.domain.base.Coordinate;

import javax.persistence.Id;
import java.util.List;

@Document(collection = "course_coordinate")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Getter
@ToString
public class CourseCoordinate {

    @Id
    private String id;
    private List<Coordinate> coordinates;
    private List<Coordinate> checkpoints;
    private List<NearInfo> nearInfos;

    public static CourseCoordinate create(List<Coordinate> coordinates, List<Coordinate> checkpoints) {
        CourseCoordinate courseCoordinate = new CourseCoordinate();
        courseCoordinate.coordinates = coordinates;
        courseCoordinate.checkpoints = checkpoints;

        return courseCoordinate;
    }

	/*
    @Id
    private String id;
    private int age;
    private String name;
    private List<String> favorite;
    private List<Point> points;

    public static CoursePoint create(int age, String name, List<String> favorite, List<Point> points) {
        CoursePoint testCollection = new CoursePoint();
        testCollection.age = age;
        testCollection.name = name;
        testCollection.favorite = favorite;
        testCollection.points = points;

        return testCollection;
    }
    */

}