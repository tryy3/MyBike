import type { Bike, Component } from "./index";

export interface BikeListItem extends Bike {
  componentCount: number;
}

export interface BikeDetail extends Bike {
  components: Component[];
}
