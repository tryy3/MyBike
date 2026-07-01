import type { Bike, ComponentOption, ComponentSlot } from "./index";

export interface BikeListItem extends Bike {
  slotCount: number;
  optionCount: number;
}

export interface SlotWithOptions extends ComponentSlot {
  options: ComponentOption[];
}

export interface BikeDetail extends Bike {
  slots: SlotWithOptions[];
}