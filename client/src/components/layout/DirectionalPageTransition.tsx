import React, { useEffect, useRef, useState, type ReactElement } from 'react';
import { useLocation, type Location } from 'react-router-dom';
import { ROUTE_ORDER } from '../../lib/routes';

interface DirectionalPageTransitionProps {
  children: ReactElement;
}

/**
 * Wraps page routes to provide direction-aware Apple-like sliding transitions.
 */
export function DirectionalPageTransition({ children }: DirectionalPageTransitionProps) {
  const location = useLocation();
  const [currentLocation, setCurrentLocation] = useState<Location>(location);
  const [leavingLocation, setLeavingLocation] = useState<Location | null>(null);
  const [direction, setDirection] = useState<'right' | 'left' | 'fade'>('fade');

  const prevLocationRef = useRef<Location>(location);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (location.pathname !== prevLocationRef.current.pathname) {
      const prevIdx = ROUTE_ORDER[prevLocationRef.current.pathname] ?? 0;
      const currIdx = ROUTE_ORDER[location.pathname] ?? 0;

      let dir: 'right' | 'left' | 'fade' = 'fade';
      if (currIdx > prevIdx) {
        dir = 'right';
      } else if (currIdx < prevIdx) {
        dir = 'left';
      }

      setLeavingLocation(prevLocationRef.current);
      setCurrentLocation(location);
      setDirection(dir);
      prevLocationRef.current = location;

      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
      }
      fallbackTimerRef.current = window.setTimeout(() => {
        setLeavingLocation(null);
        fallbackTimerRef.current = null;
      }, 300);
    }
  }, [location]);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const handleAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      requestAnimationFrame(() => {
        setLeavingLocation(null);
      });
    }
  };

  const isMovingRight = direction === 'right';

  const leavingAnimClass = isMovingRight
    ? 'animate-slide-out-to-left'
    : 'animate-slide-out-to-right';

  const enteringAnimClass = leavingLocation
    ? isMovingRight
      ? 'animate-slide-in-from-right'
      : 'animate-slide-in-from-left'
    : '';

  return (
    <div className="relative w-full overflow-hidden">
      {/* Leaving page layer */}
      {leavingLocation && (
        <div
          key={`leaving-${leavingLocation.pathname}`}
          className={`absolute inset-x-0 top-0 w-full z-0 pointer-events-none ${leavingAnimClass}`}
          aria-hidden="true"
        >
          {React.cloneElement(children, { location: leavingLocation })}
        </div>
      )}

      {/* Entering / Active page layer */}
      <div
        key={`active-${currentLocation.pathname}`}
        onAnimationEnd={handleAnimationEnd}
        className={`relative w-full z-10 ${enteringAnimClass}`}
      >
        {React.cloneElement(children, { location: currentLocation })}
      </div>
    </div>
  );
}
