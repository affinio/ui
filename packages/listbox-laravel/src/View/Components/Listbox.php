<?php

namespace Affino\Listbox\Laravel\View\Components;

use Illuminate\Support\Str;
use Illuminate\View\Component;
use Illuminate\View\View;
use JsonException;

class Listbox extends Component
{
    public string $listboxId;

    public ?string $label;

    public string $placeholder;

    public bool $loop;

    public bool $multiple;

    public string $mode;

    public ?string $model;

    public ?string $name;

    public bool $disabled;

    public string $initialValue;

    public ?string $display;

    /**
     * @param string|array|null $selected
     */
    public function __construct(
        ?string $listboxId = null,
        ?string $label = null,
        string $placeholder = 'Select',
        bool $loop = true,
        string $mode = 'single',
        ?string $model = null,
        ?string $name = null,
        bool $disabled = false,
        $selected = null,
        ?string $display = null,
    ) {
        $this->listboxId = $listboxId ?: 'affino-listbox-' . Str::uuid();
        $this->label = $label;
        $this->placeholder = $placeholder;
        $this->loop = $loop;
        $this->multiple = $this->normalizeMode($mode) === 'multiple';
        $this->mode = $this->multiple ? 'multiple' : 'single';
        $this->model = $model;
        $this->name = $name;
        $this->disabled = $disabled;
        $this->display = $display ?? $this->resolveDisplay($selected);
        $this->initialValue = $this->multiple
            ? $this->encodeSelectedValues($selected)
            : $this->stringifySelected($selected);
    }

    public function render(): View
    {
        return view('listbox-laravel::livewire.listbox');
    }

    private function normalizeMode(string $mode): string
    {
        $normalized = strtolower($mode);
        return in_array($normalized, ['multiple', 'multi'], true) ? 'multiple' : 'single';
    }

    /**
     * @param string|array|null $value
     * @return array<int, string>
     */
    private function coerceSelectedArray($value): array
    {
        if ($value === null) {
            return [];
        }

        if (is_array($value)) {
            return array_values(array_map(static fn ($item): string => (string) $item, $value));
        }

        return [(string) $value];
    }

    /**
     * @param string|array|null $value
     */
    private function encodeSelectedValues($value): string
    {
        $normalized = $this->coerceSelectedArray($value);
        try {
            return json_encode($normalized, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return '[]';
        }
    }

    /**
     * @param string|array|null $value
     */
    private function stringifySelected($value): string
    {
        $normalized = $this->coerceSelectedArray($value);
        return $normalized[0] ?? '';
    }

    /**
     * @param string|array|null $value
     */
    private function resolveDisplay($value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_array($value)) {
            $renderable = $this->coerceSelectedArray($value);
            return $renderable ? implode(', ', $renderable) : null;
        }

        $string = (string) $value;
        return $string !== '' ? $string : null;
    }
}
