import type { FieldSuggestions } from "shared";
import { getFieldSuggestions } from "../../services/field-suggestions.js";
import { builder } from "../builder.js";
import { requireUserId } from "../context.js";

const FieldSuggestionsRef = builder.objectRef<FieldSuggestions>("FieldSuggestions");

builder.objectType(FieldSuggestionsRef, {
  fields: (t) => ({
    name: t.exposeStringList("name"),
    brand: t.exposeStringList("brand"),
    model: t.exposeStringList("model"),
    purchaseStore: t.exposeStringList("purchaseStore"),
  }),
});

builder.queryField("fieldSuggestions", (t) =>
  t.field({
    type: FieldSuggestionsRef,
    resolve: (_root, _args, context) => {
      const userId = requireUserId(context);
      return getFieldSuggestions(userId);
    },
  }),
);
