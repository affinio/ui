@php
    $selectedValues = array_map('strval', (array) ($selected ?? []));
@endphp

<x-affino-combobox
    :combobox-id="$comboboxId"
    :label="$label"
    :placeholder="$placeholder"
    :mode="$mode"
    :loop="$loop"
    :model="$model"
    :name="$name"
    :disabled="$disabled"
    :pinned="$pinned"
    :open-on-pointer-down="$openOnPointerDown"
    :selected="$selected"
    :display="$display"
>
    @foreach ($options as $option)
        @php
            $value = (string) ($option['value'] ?? '');
            $optionLabel = $option['label'] ?? $value;
            $isDisabled = (bool) ($option['disabled'] ?? false);
            $isSelected = in_array($value, $selectedValues, true);
        @endphp
        <x-affino-combobox-option
            :value="$value"
            :label="$optionLabel"
            :disabled="$isDisabled"
            :selected="$isSelected"
        >
            {{ $optionLabel }}
        </x-affino-combobox-option>
    @endforeach
</x-affino-combobox>
