{{--
    排行榜。$rowsId 傳入時（結算畫面）該 <ol> 會由 hud/Hud.js 在上傳成績後重繪；
    未傳入時為純伺服器端渲染的初始榜單。
--}}
@php
    $rowsId = $rowsId ?? null;
    $title = $title ?? 'TOP PILOTS';
@endphp

<div class="leaderboard">
    <h3>{{ $title }}</h3>
    <ol @if ($rowsId) id="{{ $rowsId }}" @endif>
        @forelse ($leaderboard as $index => $score)
            <li>
                <span class="lb-rank">{{ $index + 1 }}</span>
                <span class="lb-name">{{ $score->pilot_name }}</span>
                <span class="lb-score">{{ $score->score }}</span>
            </li>
        @empty
            <li class="lb-empty">尚無紀錄</li>
        @endforelse
    </ol>
</div>
