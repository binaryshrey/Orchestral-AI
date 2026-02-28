declare module "react-simple-maps" {
  import * as React from "react";

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, any>;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    [key: string]: any;
  }
  export const ComposableMap: React.FC<ComposableMapProps>;

  export interface ZoomableGroupProps {
    zoom?: number;
    center?: [number, number];
    minZoom?: number;
    maxZoom?: number;
    [key: string]: any;
  }
  export const ZoomableGroup: React.FC<ZoomableGroupProps>;

  export interface GeographiesProps {
    geography: string | object;
    children: (props: { geographies: any[] }) => React.ReactNode;
    [key: string]: any;
  }
  export const Geographies: React.FC<GeographiesProps>;

  export interface GeographyProps {
    geography: any;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: React.CSSProperties & { outline?: string };
      hover?: React.CSSProperties & { outline?: string };
      pressed?: React.CSSProperties & { outline?: string };
    };
    [key: string]: any;
  }
  export const Geography: React.FC<GeographyProps>;

  export interface MarkerProps {
    coordinates: [number, number];
    children?: React.ReactNode;
    [key: string]: any;
  }
  export const Marker: React.FC<MarkerProps>;
}
