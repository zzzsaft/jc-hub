// useGeolocation.ts
import { useState, useEffect } from "react";

type Position = {
  latitude: number;
  longitude: number;
};

type GeolocationError = {
  code: number;
  message: string;
};

type UseGeolocationOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

type UseGeolocationResult = {
  position: Position | null;
  error: GeolocationError | null;
  isLoading: boolean;
};

export const useGeolocation = (
  options: UseGeolocationOptions = {}
): UseGeolocationResult => {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError({
        code: 0,
        message: "Geolocation is not supported by your browser",
      });
      setIsLoading(false);
      return;
    }

    const successHandler = (pos: GeolocationPosition) => {
      setPosition({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      setIsLoading(false);
    };

    const errorHandler = (err: GeolocationPositionError) => {
      setError({
        code: err.code,
        message: err.message,
      });
      setIsLoading(false);
    };

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      successHandler,
      errorHandler,
      options
    );

    // 如果需要持续监听位置变化，可以返回清理函数
    // const watchId = navigator.geolocation.watchPosition(successHandler, errorHandler, options);
    // return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { position, error, isLoading };
};
