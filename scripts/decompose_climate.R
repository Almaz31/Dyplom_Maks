# Reproduce the website's additive decomposition from its exported monthly CSV.
# Run: Rscript scripts/decompose_climate.R decomposition-UA-46-temperature.csv
args <- commandArgs(trailingOnly=TRUE)
if (length(args) != 1) stop("Supply a monthly decomposition CSV exported by the website")
d <- read.csv(args[1], fileEncoding="UTF-8-BOM")
dates <- as.Date(paste0(d$date, "-01"))
if (anyNA(dates) || anyDuplicated(dates)) stop("Invalid or duplicate dates")
expected <- seq(min(dates), max(dates), by="month")
if (length(expected) != nrow(d) || any(dates != expected)) stop("Months must be consecutive")
if (nrow(d) < 36) stop("At least 36 months are required")
y <- ts(d$value, start=c(as.integer(format(dates[1], "%Y")),
                        as.integer(format(dates[1], "%m"))), frequency=12)
z <- decompose(y, type="additive")
t <- (seq_along(y)-1)/12
fit <- lm(as.numeric(z$trend) ~ t, na.action=na.exclude)
trend <- predict(fit, newdata=data.frame(t=t))
cycle <- as.numeric(z$trend)-trend
result <- data.frame(date=d$date, value=as.numeric(y), trend=trend,
                     seasonal=as.numeric(z$seasonal), cycle=cycle,
                     residual=as.numeric(z$random))
usable <- complete.cases(result)
stopifnot(max(abs(with(result[usable, ], value-trend-seasonal-cycle-residual))) < 1e-8)
write.csv(result, "components-R.csv", row.names=FALSE, na="")
# Scalar sample lag correlations. Keep missing calendar positions in place.
v <- result$residual
center <- mean(v, na.rm=TRUE)
denominator <- sum((v-center)^2, na.rm=TRUE)
acf_rows <- do.call(rbind, lapply(seq_len(min(24, length(v)-1)), function(k) {
  i <- seq.int(k+1, length(v))
  good <- is.finite(v[i]) & is.finite(v[i-k])
  r <- if (any(good) && denominator > 1e-20)
    sum((v[i[good]]-center)*(v[i[good]-k]-center))/denominator else NA_real_
  data.frame(lag=k, value=r, pairs=sum(good))
}))
write.csv(acf_rows, "residual-acf-R.csv", row.names=FALSE, na="")
pdf("components-R.pdf", width=12, height=10)
par(mfrow=c(5,1), mar=c(3,4,2,1))
for (field in c("value", "trend", "seasonal", "cycle", "residual")) {
  plot(dates, result[[field]], type="l", xlab="", ylab=field)
}
dev.off()
pdf("residual-acf-R.pdf", width=10, height=5)
plot(acf_rows$lag, acf_rows$value, type="h", ylim=c(-1,1),
     xlab="Lag (months)", ylab="Residual autocorrelation")
abline(h=0, col="grey")
dev.off()
cat("Trend per decade:", unname(coef(fit)[2])*10, "\n")
